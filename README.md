# Vue Router 源码解析


## 路由注册

vue-router 基于 Vue 的插件机制 来实现。

在注册时，vue-router 会做以下几件事：

1、检查重复注册

2、对传入的 Vue 全局保存，避免 import Vue 

3、全局混入 beforeCreate 和 destoryed 钩子 【TODO LINK 全局混入原理】

4、将 $router $route 对象定义到 Vue 的原型上，并且让 $route 响应【TODO LINK 响应式原理】

5、全局注册 RouterView RouterLink 组件

6、定义组件中路由钩子（beforeRouteEnter beforeRouteUpdate beforeRouteLeave）的合并策略，同 created【TODO LINK 钩子合并策略】


使用全局混入，会让每一个组件都拥有下面的钩子函数：
```js
Vue.mixin({
  beforeCreate () {
    if (isDef(this.$options.router)) {
      this._routerRoot = this
      this._router = this.$options.router
      this._router.init(this)
      Vue.util.defineReactive(this, '_route', this._router.history.current)
    } else {
      this._routerRoot = (this.$parent && this.$parent._routerRoot) || this
    }
    registerInstance(this, this)
  },
  destroyed () {
    registerInstance(this)
  }
})
```

vue-router 这两个钩子函数主要是做：

1、对于根组件，即直接挂载 new Router 的组件。它的 _routerRoot 就是它自己， _router 就是挂载的 Router 实例，然后进行 router 的初始化，最后，把当前的 route 响应式的挂载到 _route 上。

2、如果是子组件，会使用它的父组件的 _routerRoot ，由于组件树的关系，那么所有组件的 _routerRoot 都会指向根组件。

3、接着会注册路由所属的组件实例（vue）。

```js
const registerInstance = (vm, callVal) => {
  let i = vm.$options._parentVnode
  // registerRouteInstance 定义在 router-view 中
  // 如果当前组件实例 vm 的父节点存在 data.registerRouteInstance
  if (isDef(i) && isDef(i = i.data) && isDef(i = i.registerRouteInstance)) {
    // 就会调用 registerRouteInstance，主要是给 matched 匹配到的路由添加当前实例
    i(vm, callVal)
  }
}
```

## 路径切换

主要梳理从一个路由导航到另一个路由发生了什么？

以 History API 为例: `/path/to/a` to `/path/to/b`

step 1. 调用 push，发生 transitionTo

step 2. 尝试根据 `/path/to/a` 匹配（创建）一个 route，发生 confirmTransition

step 3. 计算本次切换离开的组件、进入的组件和更新的组件

step 4. 依次执行路由守卫 beforeRouteLeave、beforeEach、beforeRouteUpdate、beforeEnter、resolve async components（解析异步组件）、beforeRouteEnter、beforeResolve、afterEach、DOM 更新、beforeRouteEnter 的 next 回调函数

依次执行的实现机制，基于一个 `runQueue` 函数，这个函数将依次执行 queue 里面的任务：


```js
function runQueue(queue, fn, cb) {
  const step = index => {
    if (index >= queue.length) {
      cb(); // 执行完后，调用回调
    } else {
      if (queue[index]) {
        fn(queue[index], () => {
          step(index + 1); // 按 queue 顺序执行
        })
      } else {
        step(index + 1);
      }
    }
  };

  step(0);
}
```

`runQueue` 就会按照上述机制依次执行 step 4 的路由守卫。

相同的路由守卫执行顺序：父组件 -> 子组件，这个由 `formatMatch` 函数控制：

```js
function formartMatch(record) {
  const res = [];
  while(record) {
    res.unshift(record);
    record = record.parent;
  }
  return res;
}
```

有特例：`beforeRouteLeave`，它的执行顺序是：子组件 -> 父组件。这是在 `extractGuards` 函数执行的时候传入了 `reverse: true` 翻转了守卫的顺序。


## RouterView RouterLink

RouterView 是一个函数式组件。

RouterView 的整体逻辑大概是：

1、沿 parent 链找到当前的 router-view 嵌套层级

2、根据层级在 $parent.route 中匹配到一条 RouteRecord，如果没有匹配到，渲染空

3、从 RouteRecord 中取出要渲染的组件（根据 name，默认 default），并未这条路由注册当前的组件实例

4、做一些数据处理【TODO 这里处理还不是很清楚】

5、使用 parent.$createElement 渲染。 【TODO 使用 parent.$createElement 的理由也不是很清楚】


那 RouterView 是如何知道要更新的？

在 VueRouter 以插件的形式安装时，会在根组件上将 _route 属性定义为响应式的，这个对象表示的是当前的 route 对象。

```js
Vue.util.defineReactive(this, '_route', this._router.history.current);
```

并且每个组件实例都可以通过 $route 来访问 _route ：
```js
Object.defineProperty(Vue.prototype, '$route', {
  get() { return this._routerRoot._route } // 所有组件的 _routerRoot 都指向根组件
})
```

在 RouterView 中，会从 parent.$route 拿到当前的路由对象，相当于 RouterView 订阅了这个对象的变化。
当一条路由被 confirmTransition 之后，会 updateRoute 来更新挂载到根组件上的 route，从而触发 RouterView 重新渲染。


Router Link 的大概逻辑：

1、需要传入 to 属性，表明这个 Link 会导向哪里

2、把传入的 to 规范化为一个 location ，根据这个 location 和当前路由匹配到要去的路由对象

3、然后根据 router mode 等计算出 href 

4、对样式的处理，会判断路由的相等性和包含性，添加不同的 css class

5、对事件的处理，首先会有一个事件守卫来避免绑定到 Link 上的事件可能导致的浏览器重新渲染，然后最终会调用 replace 或者 push 。（调用 push 之后的逻辑就和 路径切换 一致）

6、默认渲染 a 标签（如果自身不是，会找到子组件中的第一个 a 标签），将事件和 href 绑定到 a 标签

7、如果没有 a 标签，将事件绑定到自身


【TODO 里面还有细节】
