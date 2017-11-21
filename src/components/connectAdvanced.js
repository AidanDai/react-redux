import hoistStatics from 'hoist-non-react-statics'
import invariant from 'invariant'
import { Component, createElement } from 'react'

import Subscription from '../utils/Subscription'
import { storeShape, subscriptionShape } from '../utils/PropTypes'

let hotReloadingVersion = 0
const dummyState = {}
function noop() {}
function makeSelectorStateful(sourceSelector, store) {
  // wrap the selector in an object that tracks its results between runs.
  // 将 selector 包装在跟踪它的运行结果的对象之中
  const selector = {
    run: function runComponentSelector(props) {
      try {
        const nextProps = sourceSelector(store.getState(), props)
        if (nextProps !== selector.props || selector.error) {
          selector.shouldComponentUpdate = true
          selector.props = nextProps
          selector.error = null
        }
      } catch (error) {
        selector.shouldComponentUpdate = true
        selector.error = error
      }
    }
  }

  return selector
}

export default function connectAdvanced(
  /*
    selectorFactory is a func that is responsible for returning the selector function used to
    compute new props from state, props, and dispatch. For example:
    selectorFactory 是一个用于从 state，props 和 dispatch 计算出新的 props 的选择器函数。 例如：

      export default connectAdvanced((dispatch, options) => (state, props) => ({
        thing: state.things[props.thingId],
        saveThing: fields => dispatch(actionCreators.saveThing(props.thingId, fields)),
      }))(YourComponent)

    Access to dispatch is provided to the factory so selectorFactories can bind actionCreators
    outside of their selector as an optimization. Options passed to connectAdvanced are passed to
    the selectorFactory, along with displayName and WrappedComponent, as the second argument.
    可以通过工厂访问 dispatch, 所以 selectorFactories 可以将 actionCreators 绑定到选择器之外，作为优化。
    传递给 connectAdvanced 的 options 以及 displayName 和 WrappedComponent 都被传递给 selectorFactory,
    options 将作为 selectorFactory 的第二个参数。

    Note that selectorFactory is responsible for all caching/memoization of inbound and outbound
    props. Do not use connectAdvanced directly without memoizing results between calls to your
    selector, otherwise the Connect component will re-render on every state or props change.
    请注意，selectorFactory 负责所有的 props 传入和传出的缓存/记录。
    不要在没有缓存结果的情况下直接使用 connectAdvanced 去调用你的 selector，
    否则 Connect 组件将在每次 state 或 props 更改时重新渲染。
  */
  selectorFactory,
  // options object:
  {
    // the func used to compute this HOC's displayName from the wrapped component's displayName.
    // probably overridden by wrapper functions such as connect()
    // 这个函数用于去计算这个高阶函数对外显示的名字，名字将被当前组件的名字包裹
    // 这个函数可以被包裹函数复写，例如 connect()
    getDisplayName = name => `ConnectAdvanced(${name})`,

    // shown in error messages
    // probably overridden by wrapper functions such as connect()
    methodName = 'connectAdvanced',

    // if defined, the name of the property passed to the wrapped element indicating the number of
    // calls to render. useful for watching in react devtools for unnecessary re-renders.
    // 如果定义了，则作为 renderCountProp 传递给包裹的元素，用来指示调用 render 的次数
    // 用于在 react devtools 中观察不必要的渲染
    renderCountProp = undefined,

    // determines whether this HOC subscribes to store changes
    // 确定此高阶组件是否订阅 state 的改变
    shouldHandleStateChanges = true,

    // the key of props/context to get the store
    storeKey = 'store',

    // if true, the wrapped element is exposed by this HOC via the getWrappedInstance() function.
    // 如果是 true， 则被包裹元素将通过高阶组件来暴露 getWrappedInstance() 的函数
    withRef = false,

    // additional options are passed through to the selectorFactory
    // 附加的 options 将传递给 selectorFactory
    ...connectOptions
  } = {}
) {
  const subscriptionKey = storeKey + 'Subscription'
  const version = hotReloadingVersion++

  const contextTypes = {
    [storeKey]: storeShape,
    [subscriptionKey]: subscriptionShape,
  }
  const childContextTypes = {
    [subscriptionKey]: subscriptionShape,
  }

  return function wrapWithConnect(WrappedComponent) {
    // connect() 参数校验(必须为 React 组件)
    invariant(
      typeof WrappedComponent == 'function',
      `You must pass a component to the function returned by ` +
      `connect. Instead received ${JSON.stringify(WrappedComponent)}`
    )

    const wrappedComponentName = WrappedComponent.displayName
      || WrappedComponent.name
      || 'Component'

    const displayName = getDisplayName(wrappedComponentName)

    const selectorFactoryOptions = {
      ...connectOptions,
      getDisplayName,
      methodName,
      renderCountProp,
      shouldHandleStateChanges,
      storeKey,
      withRef,
      displayName,
      wrappedComponentName,
      WrappedComponent
    }

    class Connect extends Component {
      constructor(props, context) {
        super(props, context)

        this.version = version
        this.state = {}
        this.renderCount = 0
        // 获取 store 的方式：
        // 1.通过 props 传递 store，<connectedComponent store={innerStore}>
        // 2.通过 context 获取 store，<Provider store={outStore}>
        // 通过 props 获取 store 的方式优先级更高
        this.store = props[storeKey] || context[storeKey]
        this.propsMode = Boolean(props[storeKey])
        this.setWrappedInstance = this.setWrappedInstance.bind(this)

        // stroe 检验（必须传入 stroe）
        invariant(this.store,
          `Could not find "${storeKey}" in either the context or props of ` +
          `"${displayName}". Either wrap the root component in a <Provider>, ` +
          `or explicitly pass "${storeKey}" as a prop to "${displayName}".`
        )

        // selector 的作用是：通过过滤 state 和 ownProps 生成，生成 wrappedComponent 的 props。
        this.initSelector()
        // subscription 作用：监听 state 和 ownProps 的变化，触发 wrappedComponent 更新。
        this.initSubscription()
      }

      getChildContext() {
        // If this component received store from props, its subscription should be transparent
        // to any descendants receiving store+subscription from context; it passes along
        // subscription passed to it. Otherwise, it shadows the parent subscription, which allows
        // Connect to control ordering of notifications to flow top-down.
        // 意思是说：如果这个组件从 props 得到 store，那么这个组件的 subscription 对于后代来说应该透明，
        // 它的后代要通过 context 获取 store 和 subscription，
        // 而这个 subscription 要通过这里的 [subscriptionKey]传递.
        // 否则，[subscriptionKey] 传递的是 this.subscription，这样就可以达到自上而下的通知的目的。
        // 子组件的 getChildContext() 返回的对象和父组件的 getChildContext() 返回的对象进行比较
        // 他们的 childContextType 相同时，如果有相同的键，则父组件中的键值会被覆盖。
        // 如果子组件只返回 childContextType 要求一部分，父组件的中返回的对象同样会被传递。
        const subscription = this.propsMode ? null : this.subscription
        // 这里的 [subscriptionKey] 是暴露给子容器元素的。它们可以通过 this.context[subscriptionKey] 获取。
        return { [subscriptionKey]: subscription || this.context[subscriptionKey] }
      }

      componentDidMount() {
        if (!shouldHandleStateChanges) return

        // componentWillMount fires during server side rendering, but componentDidMount and
        // componentWillUnmount do not. Because of this, trySubscribe happens during ...didMount.
        // Otherwise, unsubscription would never take place during SSR, causing a memory leak.
        // To handle the case where a child component may have triggered a state change by
        // dispatching an action in its componentWillMount, we have to re-run the select and maybe
        // re-render.
        // componentWillMount 将在服务端渲染时被执行，但是 componentDidMount 和 componentWillUnmount 将不被执行。
        // 所以，trySubscribe 在 componentDidMount 被调用。否则，unsubscription 将永远不会发生在服务端渲染时，
        // 这将导致内存泄漏。为了处理子组件可能通过在其 componentWillMount 中 dispatch 一个 action 而改变 state
        // 的情况，我们必须重新运行 select，并且尽可能的重新渲染。
        this.subscription.trySubscribe()
        this.selector.run(this.props)
        if (this.selector.shouldComponentUpdate) this.forceUpdate()
      }

      componentWillReceiveProps(nextProps) {
        this.selector.run(nextProps)
      }

      shouldComponentUpdate() {
        return this.selector.shouldComponentUpdate
      }

      componentWillUnmount() {
        if (this.subscription) this.subscription.tryUnsubscribe()
        this.subscription = null
        this.notifyNestedSubs = noop
        this.store = null
        this.selector.run = noop
        this.selector.shouldComponentUpdate = false
      }

      // 获得被包裹的组件
      getWrappedInstance() {
        // withRef 校验（必须为布尔值）
        invariant(withRef,
          `To access the wrapped instance, you need to specify ` +
          `{ withRef: true } in the options argument of the ${methodName}() call.`
        )
        return this.wrappedInstance
      }

      // 设置被包裹的组件
      setWrappedInstance(ref) {
        this.wrappedInstance = ref
      }

      initSelector() {
        const sourceSelector = selectorFactory(this.store.dispatch, selectorFactoryOptions)
        this.selector = makeSelectorStateful(sourceSelector, this.store)
        this.selector.run(this.props)
      }

      initSubscription() {
        if (!shouldHandleStateChanges) return

        // parentSub's source should match where store came from: props vs. context. A component
        // connected to the store via props shouldn't use subscription from context, or vice versa.
        // 父组件的订阅源应该匹配 store 来之哪里：props vs. context
        // 如果组件通过 props 连接 store，则不应该从 context 获取 subscription。
        const parentSub = (this.propsMode ? this.props : this.context)[subscriptionKey]
        this.subscription = new Subscription(this.store, parentSub, this.onStateChange.bind(this))

        // `notifyNestedSubs` is duplicated to handle the case where the component is  unmounted in
        // the middle of the notification loop, where `this.subscription` will then be null. An
        // extra null check every change can be avoided by copying the method onto `this` and then
        // replacing it with a no-op on unmount. This can probably be avoided if Subscription's
        // listeners logic is changed to not call listeners that have been unsubscribed in the
        // middle of the notification loop.
        // notifyNestedSubs 被复制以处理在通知循环中间卸载组件的情况，其中 this.subscription 将被赋值为 null。
        // 通过将方法复制到 this 上，然后在卸载时用 no-op 替换，可以避免每次更改都需要额外的空值检查。
        // 如果订阅的监听器逻辑被更改为不调用在通知循环中间被取消订阅的监听器，则可以避免这种情况。
        this.notifyNestedSubs = this.subscription.notifyNestedSubs.bind(this.subscription)
      }

      onStateChange() {
        this.selector.run(this.props)

        if (!this.selector.shouldComponentUpdate) {
          this.notifyNestedSubs()
        } else {
          this.componentDidUpdate = this.notifyNestedSubsOnComponentDidUpdate
          this.setState(dummyState)
        }
      }

      notifyNestedSubsOnComponentDidUpdate() {
        // `componentDidUpdate` is conditionally implemented when `onStateChange` determines it
        // needs to notify nested subs. Once called, it unimplements itself until further state
        // changes occur. Doing it this way vs having a permanent `componentDidUpdate` that does
        // a boolean check every time avoids an extra method call most of the time, resulting
        // in some perf boost.
        // 当 onStateChange 执行，确定需要通知子组件时 componentDidUpdate 被实现
        // 一旦被调用，它会自动执行，直到进一步 state 发生变化。这样做就是拥有永久的 componentDidUpdate，
        // 每次都进行布尔检查，大部分时间都会避免使用额外的方法调用，从而导致一些提升。
        this.componentDidUpdate = undefined
        this.notifyNestedSubs()
      }

      isSubscribed() {
        return Boolean(this.subscription) && this.subscription.isSubscribed()
      }

      addExtraProps(props) {
        if (!withRef && !renderCountProp && !(this.propsMode && this.subscription)) return props
        // make a shallow copy so that fields added don't leak to the original selector.
        // this is especially important for 'ref' since that's a reference back to the component
        // instance. a singleton memoized selector would then be holding a reference to the
        // instance, preventing the instance from being garbage collected, and that would be bad
        const withExtras = { ...props }
        if (withRef) withExtras.ref = this.setWrappedInstance
        if (renderCountProp) withExtras[renderCountProp] = this.renderCount++
        if (this.propsMode && this.subscription) withExtras[subscriptionKey] = this.subscription
        return withExtras
      }

      render() {
        const selector = this.selector
        selector.shouldComponentUpdate = false

        if (selector.error) {
          throw selector.error
        } else {
          return createElement(WrappedComponent, this.addExtraProps(selector.props))
        }
      }
    }

    Connect.WrappedComponent = WrappedComponent
    Connect.displayName = displayName
    Connect.childContextTypes = childContextTypes
    Connect.contextTypes = contextTypes
    Connect.propTypes = contextTypes

    if (process.env.NODE_ENV !== 'production') {
      Connect.prototype.componentWillUpdate = function componentWillUpdate() {
        // We are hot reloading!
        if (this.version !== version) {
          this.version = version
          this.initSelector()

          // If any connected descendants don't hot reload (and resubscribe in the process), their
          // listeners will be lost when we unsubscribe. Unfortunately, by copying over all
          // listeners, this does mean that the old versions of connected descendants will still be
          // notified of state changes; however, their onStateChange function is a no-op so this
          // isn't a huge deal.
          let oldListeners = [];

          if (this.subscription) {
            oldListeners = this.subscription.listeners.get()
            this.subscription.tryUnsubscribe()
          }
          this.initSubscription()
          if (shouldHandleStateChanges) {
            this.subscription.trySubscribe()
            oldListeners.forEach(listener => this.subscription.listeners.subscribe(listener))
          }
        }
      }
    }

    return hoistStatics(Connect, WrappedComponent)
  }
}
