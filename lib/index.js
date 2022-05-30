// 实现这个项目的构建任务
const { src, dest, parallel, series, watch } = require('gulp')
const path = require('path')

const del = require('del')
const browserSync = require('browser-sync')

// 这里统一使用gulp-load-plugins管理插件
// 使用方式改为plugins.xxx

// const sass = require('gulp-sass')(require('sass'))
// const babel = require('gulp-babel')
// const swig = require('gulp-swig')
// const imagemin = require('gulp-imagemin')
const loadPlugins = require('gulp-load-plugins')
const plugins = loadPlugins()

const bs = browserSync.create()

const cwd = process.cwd()
let config = {
  // default options
  build: {
    src: 'src',
    dist: 'dist',
    temp: 'temp',
    public: 'public',
    paths: {
      styles: 'assets/styles/*.scss',
      scripts: 'assets/scripts/*.js',
      pages: '*.html',
      images: 'assets/images/**',
      fonts: 'assets/fonts/**'
    }
  }
}
try {
  const loadConfig = require(path.join(cwd, 'pages.config.js'))
  config = Object.assign({}, config, loadConfig)
} catch (e) { }

// 使用del在构建前先清除dist, temp文件夹
const clean = () => {
  return del([config.build.dist, config.build.temp])
}

// 样式处理流程
const style = () => {
  // base选项保留项目原始的目录结构,比如src/assets/styles,构建完也会是这个目录结构
  // cwd选项会自动从src开始, 然后结合config.build.paths.styles路径,结果也是'src/assets/styles/*.scss'
  return src(config.build.paths.styles, { base: config.build.src, cwd: config.build.src })
    // css代码{}完全展开
    .pipe(plugins.sass({ outputStyle: 'expanded' }))
    .pipe(dest(config.build.temp))
    .pipe(bs.reload({ stream: true }))
}

// js文件处理
const script = () => {
  return src(config.build.paths.scripts, { base: config.build.src, cwd: config.build.src })
    // babel preset 预设
    .pipe(plugins.babel({ presets: [require('@babel/preset-env')] }))
    .pipe(dest(config.build.temp))
    .pipe(bs.reload({ stream: true }))
}

const page = () => {
  // 如果src目录下有多个html需要编译的话,地址可以写成'src/**/*.html'表示src下任意的html文件,下同
  return src(config.build.paths.pages, { base: config.build.src, cwd: config.build.src })
    // 向html文件中传入data
    .pipe(plugins.swig({ data: config.data, defaults: { cache: false } })) // cache选项防止模板缓存导致页面不能及时更新
    .pipe(dest(config.build.temp))
    .pipe(bs.reload({ stream: true }))
}

// 图片处理
const image = () => {
  return src(config.build.paths.images, { base: config.build.src, cwd: config.build.src })
    .pipe(plugins.imagemin())
    .pipe(dest(config.build.dist))
}

// 字体处理
const font = () => {
  return src(config.build.paths.fonts, { base: config.build.src, cwd: config.build.src })
    .pipe(plugins.imagemin())
    .pipe(dest(config.build.dist))
}

// 处理public中的文件,原封不动放到public
const extra = () => {
  return src('**', { base: config.build.public, cwd: config.build.public })
    .pipe(dest(config.build.dist))
}

// 开发服务器配置
const serve = () => {
  // 使用gulp的watch来监视src下源码的变化, 重新执行对应的任务
  // 这里cwd的作用也是默认从src开始,结果是'src/assets/styles/*.scss'这种
  watch(config.build.paths.styles, { cwd: config.build.src }, style)
  watch(config.build.paths.scripts, { cwd: config.build.src }, script)
  watch(config.build.paths.pages, { cwd: config.build.src }, page)

  // 响应public/assets里的文件发生的变化
  watch([
    config.build.paths.images,
    config.build.paths.fonts
  ], { cwd: config.build.src }, bs.reload)

  watch(['**'], { cwd: config.build.public }, bs.reload)

  bs.init({
    // 关闭bs的一些提示
    notify: false,
    port: 2080, // 端口
    // open: false, //自动打开窗口,看自己需求,

    // 可以监听指定目录的变化,自动更新展示效果,如果任务中配置了pipe(bs.reload({ stream: true }))就不需要了
    // files: 'dist/**',
    server: {
      // 根目录,这里数组的原因是: 启动服务器后会依次寻找数组中的文件夹,如果找不到相应文件就会继续往下寻找
      // 我们开发环境下不需要每次更新都对public/assets文件夹里的文件进行上面的处理任务
      // 让develop能以最小的代价来执行
      baseDir: [config.build.temp, config.build.dist, config.build.public],
      // index.html文件中需要特殊处理的路径
      routes: {
        '/node_modules': 'node_modules'
      }
    }
  })
}

const useref = () => {
  return src(config.build.paths.pages, { base: config.build.temp, cwd: config.build.temp })
  // html中有些是需要引入第三方库,比如:"/node_modules/bootstrap/xxx/xxxx"
  // 这些文件发布到线上后,在服务器中肯定是找不到的,开发环境之所以运行没问题是因为我们在server选项中配置了routes属性来映射这个路径
  // 处理方法是: 在html中需要引入的资源那行html代码前后用注释来进行标记,之后useref会自动处理这部分内容,如下

  /*
    * <!-- build:css assets/styles/vender.css-->
    * <link rel="stylesheet" href="/node_modules/bootstrap/dist/css/bootstrap.css">
    * <!-- endbuild -->
    * */

    // 最终,这个第三方依赖文件会被打包到标记注释所设置的assets/styles/vender.css中
    // 并且,如果指定的文件名是一样的话(比如都是vender.css)代码就会合并到一个文件中并压缩
    /* ----------------------------------------------------------------------------------- */
    // searchPath用来指定在哪些路径下寻找文件,比如/node_module就在'.'项目根目录下寻找
    .pipe(plugins.useref({ searchPath: [config.build.temp, '.'] }))
    // 使用gulp-if插件来判断html js css,并执行相应的transform
    .pipe(plugins.if(/\.js$/, plugins.uglify()))
    .pipe(plugins.if(/\.css$/, plugins.cleanCss()))
    .pipe(plugins.if(/\.html$/, plugins.htmlmin({
      collapseWhitespace: true, // html压缩,换行,空格等
      minifyCSS: true, // 压缩行内style
      minifyJS: true // 压缩行内js
    })))
    .pipe(dest(config.build.dist))
}

// 并行处理
const compile = parallel(style, script, page)

// 上线之前执行的任务 串行套并行,再套并行
const build = series(
  clean,
  parallel(
    series(compile, useref),
    image,
    font,
    extra
  )
)
// 开发环境下的任务
const develop = series(compile, serve)

module.exports = {
  clean,
  style,
  script,
  build,
  develop,
  compile
}
