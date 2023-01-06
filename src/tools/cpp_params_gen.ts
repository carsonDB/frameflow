import { readFileSync, writeFileSync } from 'fs'
import { parse } from 'yaml'
import { join } from 'path';


const generatedPath = 'src/cpp/generated'
const templatePath = 'src/tools/params_template.h'
const yamlPath = 'src/tools/params.yaml'


type Member = [string, string, string?, string?] // [type, variableName, setter, getter]

const setter = (context: string, name: string, fn?: string) => fn ? 
    `${fn}(${context}, ${name});` : `${context}->${name} = ${name};`

const getter = (context: string, name: string, fn?: string) => fn ? 
    `${fn}(${context});` : `${context}->${name};`


const struct_template = (name: string, context: string, members: Member[]) => 
`struct ${name} { 
    ${members.map(m => `${m[0]} ${m[1]};\n`).join('')}
    void fill_context(${context}* ctx) {
        ${members.map(m => setter('ctx', m[1], m[2]) + '\n').join('')}
    };
};\n`

const getter_template = (name: string, members: Member[]) => `
#define ${name}_GETTER(contextName) ${ members.map(m =>
    ` \\\n\t ${m[0]} get_${m[1]}() { return ${getter('contextName', m[1], m[3])} }`).join('')}
`

const setter_template = (name: string, members: Member[]) => `
#define ${name}_SETTER(contextName) ${ members.map(m => 
    ` \\\n\t void set_${m[1]}(${m[0]}& ${m[1]}) { ${setter('contextName', m[1], m[2])} }`).join('')}
`

const embind_template = (name: string, members: Member[]) => 
    `value_object<${name}>("${name}")\n${members.map(m => `\t.field("${m[1]}", &${name}::${m[1]})\n`).join('')};`


function build() {
    const paramsStr = readFileSync(yamlPath, { encoding: 'utf-8' })
    const params: {[k in string]: {members: Member[], context: string}} = parse(paramsStr)
    let cppCode = readFileSync(templatePath, { encoding: 'utf-8' })

    cppCode = cppCode.replace('${params_struct_define}',
        Object.entries(params).map(([name, {members, context}]) => 
            struct_template(name, context, members)).join('')
    )    
    
    cppCode = cppCode.replace('${params_getter_macro}',
        Object.entries(params).map(([name, {members}]) => 
            getter_template(name, members)).join('')
    )

    cppCode = cppCode.replace('${params_setter_macro}',
        Object.entries(params).map(([name, {members}]) => 
            setter_template(name, members)).join('')
    )
    
    cppCode = cppCode.replace('${params_embind}',
        Object.entries(params).map(([name, {members}]) => 
            embind_template(name, members)).join('')
    )

    writeFileSync(join(generatedPath, 'params.h'), cppCode);
}

build()
