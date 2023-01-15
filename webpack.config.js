const path = require('path');
const TerserPlugin = require("terser-webpack-plugin");
const HtmlWebpackPlugin = require('html-webpack-plugin');


const basicConfig = {
    entry: { frameflow: './src/ts/main.ts' },
    module: {
        rules: [
            { test: /\.ts?$/, use: 'ts-loader', exclude: /node_modules/ },
            { test: /\.wasm$/, type: `asset/resource` },
            // { test: /ffmpeg.js$/, parser: { javascript: { url: false } } }
        ],
    },

    resolve: {
        extensions: ['.ts', '...'],
        fallback: { events: false, fs: false, module: false, url: false, crypto: false, path: false }
    },

    output: {
        filename: '[name].js',
        library: {
            type: 'umd',
            export: 'default',
            name: 'frameflow',
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
            title: 'frameflow dev',
            template: 'examples/browser/index.html',
        })
    ],
    devServer: {
        static: path.join(__dirname, "dist"),
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
    },
    devtool: 'source-map',
}


module.exports = (env, argv) => {
    const config = {...basicConfig}
    if (argv.mode === 'development') {
        Object.assign(config, devConfig)
    }
    else if (argv.mode === 'production') {
        Object.assign(config, prodConfig)
    }
    else throw `specify env`

    return config
}