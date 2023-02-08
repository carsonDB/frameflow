import React, { useEffect, useRef, useState } from 'react';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import CodeEditor from '@site/src/components/codeEditor';
import HomepageFeatures from '@site/src/components/HomepageFeatures';
import Frameflow_diagram from '@site/static/img/diagram.png';
import Layout from '@theme/Layout';
import Button from 'react-bootstrap/Button';
import 'bootstrap/dist/css/bootstrap.min.css';
import clsx from 'clsx';
import fflow from 'frameflow';

import styles from './index.module.css';

function HomepageHeader() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className="container">
        <h1 className="hero__title">{siteConfig.title}</h1>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <img src={Frameflow_diagram} title="FramFlow diagram" className="diagram" />
        <div className={styles.buttons}>
          <Link
            className="button button--secondary button--lg"
            to="/blog/why-frameflow">
            Why FrameFlow
          </Link>
          <Link
            className="button button--secondary button--lg"
            to="#HomepageDemo">
            Try a demo
          </Link>
        </div>
      </div>
    </header>
  );
}


const demoVideoURL = require('@site/static/video/flame.avi').default
const demoAudioURL = require('@site/static/video/audio.mp3').default
const demoCode = `
// import fflow from 'frameflow'
// Given Variables: (fflow, console, onProgress, videoDom)
let videoURL = '${demoVideoURL}'
let audioURL = '${demoAudioURL}'
let video = await fflow.source(videoURL)
let audio = await fflow.source(audioURL)
let trimAudio = audio.trim({start: 10, duration: video.duration})
let newVideo = fflow.group([video, trimAudio])
let outBlob = await newVideo.exportTo(Blob, {format: 'mp4', progress: onProgress})
videoDom.src = URL.createObjectURL(outBlob)
`



function HomepageDemo() {
  const [code, setCode] = useState(demoCode)
  const [msg, setMsg] = useState('')
  const videoRef = useRef(null)
  // preload
  useEffect(() => { fflow.loadWASM() })

  const onClick = () => {
    setMsg(' ...')
    Function(`"use strict"; 
            const {fflow, console, Blob, onProgress, videoDom} = this;
            (async () => { ${code} })()
    `).bind({fflow, console, Blob, 
      onProgress: (p: number) => setMsg(` (${(p*100).toFixed(1)}%)`), videoDom: videoRef.current})()
  }

  return (
    <section id='HomepageDemo' >
        <div style={{textAlign: 'center'}}>
          <h1 className="hero__title">Try a demo</h1>
          <h4>Trim a audio and group with avi video, to mp4 file, which can play in HTMLVideoElement.</h4>
          
          <Button variant='warning' onClick={onClick} >
            <span>Click to Run</span>
            {msg}
          </Button>
        </div>
        <div style={{display: 'flex', justifyContent: 'center'}}>
            <video controls src={demoVideoURL} ref={videoRef} />
            <audio controls src={demoAudioURL} />
        </div>
        <div style={{display: 'flex', justifyContent: 'center'}}>
          <CodeEditor onChange={c => setCode(c)} style={{width: '65%'}} >
            {code}
          </CodeEditor>
        </div>
    </section>
  )
}

export default function Home() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout
      title={`${siteConfig.title}`}
      description="Description will go into a meta tag in <head />">
      <HomepageHeader />
      <main>
        <HomepageFeatures />
        <HomepageDemo />
      </main>
    </Layout>
  );
}
