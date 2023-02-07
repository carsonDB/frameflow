import React, { CSSProperties } from 'react';
import Editor from 'react-simple-code-editor';
import { highlight, languages } from 'prismjs';
import prismStyle from 'prismjs/themes/prism.css';

export default function CodeEditor(props: {children: string, onChange: (code: string) => void, style?: CSSProperties}) {

    return (
        <Editor 
          value={props.children}
          padding={10}
          highlight={code => highlight(code, languages.js, 'js')} 
          onValueChange={code => props.onChange(code)}
          style={{
            fontFamily: 'Consolas, Monaco, "Andale Mono", "Ubuntu Mono", monospace',
            fontSize: 16,
            background: '#f5f2f0',
            borderRadius: 'var(--ifm-code-border-radius)',
            lineBreak: 'anywhere',
            ...props.style,
          }}
        />
    )
  }
  