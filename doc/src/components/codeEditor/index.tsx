import React, { CSSProperties, useRef } from 'react';
import Highlight, { defaultProps } from "prism-react-renderer";
import { useEditable } from 'use-editable'
import theme from 'prism-react-renderer/themes/github';

export default function CodeEditor(props: {children: string, onChange: (code: string) => void, style?: CSSProperties}) {
  const ref = useRef(null)
  useEditable(ref, props.onChange)

  return (
    <Highlight {...defaultProps} code={props.children} theme={theme} language='javascript' >
      {({ className, style, tokens, getLineProps, getTokenProps }) => (
        <pre className={className} style={style} ref={ref} >
          {tokens.map((line, i) => (
            <div {...getLineProps({ line, key: i })}>
              {line.map((token, key) => (
                <span {...getTokenProps({ token, key })} />
              ))}
            </div>
          ))}
        </pre>
      )}
    </Highlight >
  )
}
  