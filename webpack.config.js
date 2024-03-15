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
        'dcent-web-connector': './src/index.js'
    },

    devtool: process.env.NODE_ENV === 'production' ? false : 'inline-source-map',

    output: {
        filename: '[name].min.js',
        path: path.resolve(__dirname, 'dist'),
        libraryTarget: 'this'
    },

    module: {
        rules: [{
            test: /\.js$/,
            exclude: /node_modules/,
            use: {
                loader: 'babel-loader'
            }
        }]
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
