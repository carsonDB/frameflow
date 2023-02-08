const path = require('path');
const TerserPlugin = require("terser-webpack-plugin");
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CompressionPlugin = require("compression-webpack-plugin");


const basicConfig = {
    entry: './src/ts/main.ts',
    module: {
        rules: [
            { test: /\.ts?$/, use: 'ts-loader', exclude: /node_modules/ },
            {
                test: /\.worker\.js$/,
                loader: "worker-loader",
                options: { inline:"no-fallback" }
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
        fallback: { events: false, fs: false, module: false, url: false, crypto: false, path: false }
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
            title: 'frameflow dev',
            template: 'examples/browser/index.html',
        })
    ],
    devServer: {
        // static: path.join(__dirname, "dist"),
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
    },
    plugins: [
        new CompressionPlugin({
            test: /\.wasm$/,
        })
    ]
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