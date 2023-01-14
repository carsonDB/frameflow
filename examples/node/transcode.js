const fflow = require('../../src/cpp/ts/main')


(async () => {
    let src = await fflow.source('../assets/flame.avi')
    await src.exportTo('flame.mp4')
})