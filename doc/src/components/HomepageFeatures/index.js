import React from 'react';
import CodeBlock from '@theme/CodeBlock';
import clsx from 'clsx';
import styles from './styles.module.css';

const FeatureList = [
  {
    title: 'Stream I/O',
    Code: (
      <CodeBlock language="js" >{
        `let src = await fflow.source('...')\nconsole.log(src.metadata)`
      }</CodeBlock>
    ),
    description: (
      <>
        FrameFlow was designed to support all JavaScript I/O as stream way.
        Just one simple line, with metadata as side effects.
      </>
    ),
  },
  {
    title: 'Build filter graph in JS way',
    Code: (
      <CodeBlock language="js" >
        {`src.trim({start: 1, duration: 10})\n`}
        {`   .setVolume(0.5)\n`}
      </CodeBlock>
    ),
    description: (
      <>
        Instead of building filter graph using FFmpeg command-line, 
        frameflow use a simple way to construct. Here is to trim a video input.
      </>
    ),
  },
  {
    title: 'Control progress by yourself',
    Code: (
      <CodeBlock language="js" >
        {`// method 1 \n`}
        {`await src.exportTo('...')\n`}
        {`// method 2 \n`}
        {`let target = await src.export()\n`}
        {`for await (let chunk of target) {\n`}
        {`    // do something... \n`}
        {`}\n`}
        {`// method 3 \n`}
        {`let target = await src.export()\n`}
        {`// one at a time\n`}
        {`let chunk = await target.next()\n`}
      </CodeBlock>
    ),
    description: (
      <>
        You can choose either <code>exportTo</code> to export video automatically,
        or <code>export</code> to stream output.
      </>
    ),
  },
];

function Feature({Code, title, description}) {
  return (
    <div className={clsx('col col--4')}>
      <div className="text--center">
        {/* <Svg className={styles.featureSvg} role="img" /> */}
        <div style={{textAlign: 'left'}}>{Code}</div>
      </div>
      <div className="text--center padding-horiz--md">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures() {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
