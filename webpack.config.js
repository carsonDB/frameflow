const path = require('path');
const webpack = require('webpack');
const TerserPlugin = require("terser-webpack-plugin");
const HtmlWebpackPlugin = require('html-webpack-plugin');


const basicConfig = {
    entry: './src/ts/main.ts',
    module: {
        rules: [
            { test: /\.ts?$/, use: 'ts-loader', exclude: /node_modules/ },
            {
                test: /\.worker\.js$/,
                loader: "worker-loader",
                options: { inline: "no-fallback" }
            },
            { 
                test: /\.wasm$/, 
                type: `asset/resource`,
                generator: { filename: '[name].wasm' }
            },
        ],
    },

    resolve: {
        extensions: ['.ts', '.d.ts', '...'],
        fallback: { events: false, fs: false, module: false, url: false, crypto: false, path: false, worker_threads: false }
    },

    output: {
        filename: 'frameflow.min.js',
        library: {
            name: 'frameflow',
            type: 'umd',
            export: 'default',
        },
        globalObject: 'this',
        path: path.resolve(__dirname, 'dist'),
    },
}


// for development
const devConfig = {
    mode: 'development',
    plugins: [
        new HtmlWebpackPlugin({ 
            title: 'FrameFlow dev',
            template: 'examples/browser/index.html',
        }),
    ],
    devServer: {
        static: path.join(__dirname, "examples"),
    },
    devtool: 'eval-cheap-module-source-map',
}


// for production
const prodConfig = {
    mode: 'production',
    optimization: {
        minimize: true,
        minimizer: [
            new TerserPlugin()
        ],
    }
}


module.exports = (env, argv) => {
    const config = {...basicConfig}
    const plugins = [...config.plugins??[]]
    if (argv.mode === 'development') {
        plugins.push(...devConfig.plugins??[])
        Object.assign(config, devConfig)
    }
    else if (argv.mode === 'production') {
        plugins.push(...prodConfig.plugins??[])
        Object.assign(config, prodConfig)
    }
    else throw `specify env`


    return {...config, plugins: plugins.length > 0 ? plugins : undefined}
}