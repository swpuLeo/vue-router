import View from './components/view'
import Link from './components/link'

// 全局保存 Vue
export let _Vue

export function install (Vue) {
  // 防重复注册
  if (install.installed && _Vue === Vue) return
  install.installed = true

  _Vue = Vue

  const isDef = v => v !== undefined

  const registerInstance = (vm, callVal) => {
    let i = vm.$options._parentVnode
    // registerRouteInstance 定义在 router-view 中
    // 如果当前组件实例 vm 的父节点存在 data.registerRouteInstance
    if (isDef(i) && isDef(i = i.data) && isDef(i = i.registerRouteInstance)) {
      // 就会调用 registerRouteInstance，主要是给 matched 匹配到的路由添加当前实例
      i(vm, callVal)
    }
  }

  // 全局混入钩子函数，每个组件都会注入
  Vue.mixin({
    beforeCreate () {
      if (isDef(this.$options.router)) { // 一般来说是根组件，挂载了 new Router
        // 依次在根组件上挂载 _routerRoot _router _route
        this._routerRoot = this
        this._router = this.$options.router
        // 完成 router 的初始化
        this._router.init(this)
        Vue.util.defineReactive(this, '_route', this._router.history.current)
      } else { // 一般来说是子组件
        // 通过使用 $parent._routerRoot 的方式，会让所有组件的 _routerRoot 都指向根组件
        this._routerRoot = (this.$parent && this.$parent._routerRoot) || this
      }
      // this 当前组件
      registerInstance(this, this)
    },
    destroyed () {
      registerInstance(this)
    }
  })

  Object.defineProperty(Vue.prototype, '$router', {
    get () { return this._routerRoot._router }
  })

  Object.defineProperty(Vue.prototype, '$route', {
    get () { return this._routerRoot._route }
  })

  Vue.component('RouterView', View)
  Vue.component('RouterLink', Link)

  // 组件路由钩子的合并策略，采用和 created 一样的策略
  const strats = Vue.config.optionMergeStrategies
  // use the same hook merging strategy for route hooks
  strats.beforeRouteEnter = strats.beforeRouteLeave = strats.beforeRouteUpdate = strats.created
}
