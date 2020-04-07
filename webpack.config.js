const path = require('path');
const {
    CleanWebpackPlugin
} = require('clean-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
    target: "web",
    entry: {
        'dcent-web-connector': './index.js'
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
                loader: "babel-loader"
            }
        }]
    },

    plugins: [
        new CleanWebpackPlugin(),
        new HtmlWebpackPlugin({
            inject: false,
            template: path.resolve(__dirname, 'index.html')
        }),
        new CopyPlugin([{
            from: 'plugin',
            to: 'plugin'
        }])
    ],

    devServer: {
        host: '0.0.0.0',
        port: 9090,
        contentBase: path.join(__dirname, 'dist'),
    }
}