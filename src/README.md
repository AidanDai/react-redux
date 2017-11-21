# React-Redux

## 1 Project Structure

```
├── components
│   ├── connectAdvanced.js        # 默认 connect 高阶组件
│   └── Provider.js               # 创建 Provider 高阶组件函数
├── connect
│   ├── selectorFactory.js        # selector 工厂函数
│   ├── connect.js                # connect 函数
│   ├── wrapMapToProps.js         # 封装 mapStateToProps 函数
│   ├── mergeProps.js             # mergeProps 工厂函数
│   ├── mapDispatchToProps.js     # mapDispatchToProps 工厂函数
│   ├── verifySubselectors.js     # connect 参数校验
│   └── mapStateToProps.js        # mapStateToProps 工厂函数
├── utils
│   ├── Subscription.js
│   ├── shallowEqual.js
│   ├── warning.js                # 报错的封装
│   ├── PropTypes.js              # 自定义 PropTypes
│   ├── verifyPlainObject.js      # 封装 isPlainObject 函数
│   └── wrapActionCreators.js     # 封装 bindActionCreators 函数
├── index.js                      # 入口文件
└── README.md
```

## 2 API

### 2.1 Provider

```html
<Provider store={stroe}>
  <Component/>
</Provider>
```

### 2.2 connect

```javascript
connect([mapStateToProps], [mapDispatchToProps], [mergeProps], [options])
```

```javascript
Function: mapStateToProps(state, [ownProps]): stateProps
Function: mapDispatchToProps(dispatch, [ownProps]): dispatchProps
Function: mergeProps(stateProps, dispatchProps, ownProps): props
Object: options
  [pure]
  [areStatesEqual]
  [areOwnPropsEqual]
  [areStatePropsEqual]
  [areMergedPropsEqual]
  [storeKey]
```

### 2.3 connectAdvanced

```javascript
connectAdvanced(selectorFactory, [connectOptions])
```

```javascript
Function: selectorFactory(dispatch, factoryOptions): selector(state, ownProps): props
Object: connectOptions
  [getDisplayName]
  [methodName]
  [renderCountProp]
  [shouldHandleStateChanges]
  [storeKey]
  [withRef]
```

### 2.4 createProvider

```javascript
createProvider(storeKey, subKey)
```
