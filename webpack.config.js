const path = require('path')
const webpack = require('webpack')
const {
    CleanWebpackPlugin
} = require('clean-webpack-plugin')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const CopyPlugin = require('copy-webpack-plugin')

module.exports = (env, argv) => {
    // bridge popup URL 빌드 시점 주입 (singleton.ts `__DCENT_BRIDGE_POPUP_URL__`).
    //   production 빌드 → '' (PopupTransport 기본값 v2bridge 사용)
    //   development 빌드(yarn dev/build-dev) → http://localhost:5173 (로컬 SDK dev 서버)
    //   DCENT_BRIDGE_POPUP_URL 환경변수로 override
    const isProd = (argv && argv.mode) === 'production'
    const bridgePopUpUrl =
        process.env.DCENT_BRIDGE_POPUP_URL || (isProd ? '' : 'http://localhost:5173')

    return {
    mode: 'development', // or 'production'
    target: 'web',
    entry: {
        // v1: 기존 JS 코드 (src-v1/ — 아카이브, read-only)
        'v1/dcent-web-connector': './src-v1/index.js',
        // v2: TypeScript 기반 신규 진입점 (m08-01-05 — facade 완전체)
        // v2 entry: UMD 형식으로 entire module exports를 'dcent' 이름에 노출
        //   - 브라우저 (script tag): window.dcent = { default, PopupTransport, ... }
        //   - Node CJS (require): module.exports = { default, PopupTransport, ... }
        //   - ES Module (import): named imports + default
        // index-v2.html에서 default export object 별칭 처리:
        //   <script>window.dcent = window.dcent.default || window.dcent;</script>
        // harness.html 등 transport-level 테스트는 window.dcent.PopupTransport 등으로 접근
        'v2/dcent-web-connector': {
            import: './src/index.ts',
            library: {
                name: 'dcent',
                type: 'umd',
                export: undefined  // entire module (named + default)
            }
        }
    },

    devtool: process.env.NODE_ENV === 'production' ? false : 'inline-source-map',

    output: {
        filename: '[name].min.js',
        path: path.resolve(__dirname, 'dist'),
        // v1 entry의 default behavior — IIFE assigned to `this`
        // v2 entry는 위 entry 디스크립터에서 library 설정 (entry-specific override, type='umd')
        libraryTarget: 'this',
        // m08-01-05: UMD가 globalThis를 쓰도록 — 'self'는 Node에서 undefined
        // 이 옵션은 v2 entry의 UMD wrapper에만 영향 (v1 entry는 'this' libraryTarget)
        globalObject: 'typeof self !== \'undefined\' ? self : this'
    },

    resolve: {
        extensions: ['.ts', '.js']
    },

    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader'
                }
            },
            {
                test: /\.ts$/,
                exclude: /node_modules/,
                use: {
                    loader: 'ts-loader'
                }
            }
        ]
    },

    plugins: [
        new CleanWebpackPlugin(),
        new HtmlWebpackPlugin({
            inject: false,
            template: path.resolve(__dirname, 'index.html')
        }),
        new webpack.ProvidePlugin({
            Buffer: ['buffer', 'Buffer'],
        }),
        new webpack.DefinePlugin({
            __DCENT_BRIDGE_POPUP_URL__: JSON.stringify(bridgePopUpUrl),
        }),
        new CopyPlugin([{
            from: 'plugin',
            to: 'plugin'
        }])
    ],

    devServer: {
        host: '0.0.0.0',
        port: 9090,
        static: {
            directory: path.join(__dirname, 'dist')
        }
    }
    }
}
