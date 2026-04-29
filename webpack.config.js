const path = require('path')
const webpack = require('webpack')
const {
    CleanWebpackPlugin
} = require('clean-webpack-plugin')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const CopyPlugin = require('copy-webpack-plugin')

module.exports = {
    mode: 'development', // or 'production'
    target: 'web',
    entry: {
        // v1: 기존 JS 코드 (src-v1/ — 아카이브, read-only)
        'v1/dcent-web-connector': './src-v1/index.js',
        // v2: TypeScript 기반 신규 진입점 (m01-03에서 실제 구현 추가)
        'v2/dcent-web-connector': './src/index.ts'
    },

    devtool: process.env.NODE_ENV === 'production' ? false : 'inline-source-map',

    output: {
        filename: '[name].min.js',
        path: path.resolve(__dirname, 'dist'),
        libraryTarget: 'this'
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
