import connectAdvanced from '../components/connectAdvanced'
import shallowEqual from '../utils/shallowEqual'
import defaultMapDispatchToPropsFactories from './mapDispatchToProps'
import defaultMapStateToPropsFactories from './mapStateToProps'
import defaultMergePropsFactories from './mergeProps'
import defaultSelectorFactory from './selectorFactory'

/*
  connect is a facade over connectAdvanced. It turns its args into a compatible
  selectorFactory, which has the signature:
  connect 是 connectAdvanced 的一个封装。
  它将它的参数转化成一个兼容 selectorFactory 函数的参数， selectorFactory 函数具有如下签名：

    (dispatch, options) => (nextState, nextOwnProps) => nextFinalProps

  connect passes its args to connectAdvanced as options, which will in turn pass them to
  selectorFactory each time a Connect component instance is instantiated or hot reloaded.
  connect 传递它的参数给 connectAdvanced 作为 options，每次Connect组件实例被实例化或热重新加载时，
  它们又将它们传递给selectorFactory。

  selectorFactory returns a final props selector from its mapStateToProps,
  mapStateToPropsFactories, mapDispatchToProps, mapDispatchToPropsFactories, mergeProps,
  mergePropsFactories, and pure args.
  selectorFactory 从其 mapStateToProps, mapStateToPropsFactories, mapDispatchToProps,
  mapDispatchToPropsFactories, mergeProps, mergePropsFactories, and pure args. 返回最终的 props，

  The resulting final props selector is called by the Connect component instance whenever
  it receives new props or store state.
  每当 connet 组件实例接收新的 props 或者 store state 时返回最终 props 的 selector 函数将会被调用
 */

// mapStateToProps 校验（是否传入，若传入必须为函数）
function match(arg, factories, name) {
  for (let i = factories.length - 1; i >= 0; i--) {
    const result = factories[i](arg)
    if (result) return result
  }

  return (dispatch, options) => {
    throw new Error(`Invalid value of type ${typeof arg} for ${name} argument when connecting component ${options.wrappedComponentName}.`)
  }
}

function strictEqual(a, b) { return a === b }

// createConnect with default args builds the 'official' connect behavior. Calling it with
// different options opens up some testing and extensibility scenarios
// 通过设置默认参数的 createConnect 函数来构建官方的 connect 函数
// 使用不同的选项调用它可以打开一些测试和可扩展性场景
export function createConnect({
  connectHOC = connectAdvanced, // connect 高阶组件
  mapStateToPropsFactories = defaultMapStateToPropsFactories, // mapStateToProps 工厂函数
  mapDispatchToPropsFactories = defaultMapDispatchToPropsFactories, // mapDispatchToProps 工厂函数
  mergePropsFactories = defaultMergePropsFactories, // mergeProps 工厂函数
  selectorFactory = defaultSelectorFactory // selector 工厂函数
} = {}) {
  return function connect(
    mapStateToProps, // 用户定义的 mapStateToProps 函数，接收 state 参数
    mapDispatchToProps, // 用户定义的 mapDispatchToProps 函数，接收 dispatch 参数
    // 接收 stateProps, dispatchProps, parentProps 参数
    // stateProps 是 mapStateToProps 的返回值
    // dispatchProps 是 mapDispatchToProps 返回值
    // parentProps 是当前组件自己的属性
    mergeProps, // 用户定义的 mergeProps 函数
    {
      pure = true,
      areStatesEqual = strictEqual,
      areOwnPropsEqual = shallowEqual,
      areStatePropsEqual = shallowEqual,
      areMergedPropsEqual = shallowEqual,
      ...extraOptions
    } = {} // 配置参数
  ) {
    const initMapStateToProps = match(mapStateToProps, mapStateToPropsFactories, 'mapStateToProps')
    const initMapDispatchToProps = match(mapDispatchToProps, mapDispatchToPropsFactories, 'mapDispatchToProps')
    const initMergeProps = match(mergeProps, mergePropsFactories, 'mergeProps')

    return connectHOC(selectorFactory, {
      // used in error messages
      methodName: 'connect',

       // used to compute Connect's displayName from the wrapped component's displayName.
      getDisplayName: name => `Connect(${name})`,

      // if mapStateToProps is falsy, the Connect component doesn't subscribe to store state changes
      shouldHandleStateChanges: Boolean(mapStateToProps),

      // passed through to selectorFactory
      initMapStateToProps,
      initMapDispatchToProps,
      initMergeProps,
      pure,
      areStatesEqual,
      areOwnPropsEqual,
      areStatePropsEqual,
      areMergedPropsEqual,

      // any extra options args can override defaults of connect or connectAdvanced
      ...extraOptions
    })
  }
}

export default createConnect()
