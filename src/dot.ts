import { CallHierarchyNode } from './call'
import * as fs from 'fs'
import * as vscode from 'vscode'
import { isDeepStrictEqual } from 'util'
import { output } from './extension'

export function generateDot(
    graph: CallHierarchyNode,
    path: string,
    isIncoming: boolean,
) {
    const dot = new Graph(isIncoming)
    const root = vscode.workspace.workspaceFolders?.[0].uri.path ?? ''
    const fileIdMap = new Map<string, number>()
    const funcIdMap = new Map<string, number>()
    let fileCounter = 1
    let funcCounter = 1

    dot.addAttr({ rankdir: isIncoming ? 'RL' : 'LR' })
    const getNode = (n: CallHierarchyNode) => {
        const filePath = n.item.uri.path
        const funcName = n.item.name
        const line = n.item.range.start.line
        const char = n.item.range.start.character

        if (!fileIdMap.has(filePath)) {
            fileIdMap.set(filePath, fileCounter++)
        }
        if (!funcIdMap.has(funcName)) {
            funcIdMap.set(funcName, funcCounter++)
        }

        const fileId = fileIdMap.get(filePath)
        const funcId = funcIdMap.get(funcName)

        const nodeId = `${fileId}_${funcId}_${line}_${char}`

        return {
            name: `"${nodeId}"`, // Use the new ID format
            attr: { label: n.item.name },
            subgraph: {
                name: String(fileId),
                attr: { label: n.item.uri.path.replace(root, '${workspace}') },
            },
            next: [],
        } as Node
    }
    const node = getNode(graph)
    const set = new Set<Node>()

    const insertNode = (n: Node, c: CallHierarchyNode) => {
        set.add(n)
        for (const child of c.children) {
            const next = getNode(child)
            let isSkip = false
            for (const s of set) {
                if (isNodeEqual(s, next)) {
                    if (isIncoming) {
                        // Reverse edge direction for incoming calls
                        s.next.push(n)
                    } else {
                        n.next.push(s)
                    }
                    isSkip = true
                }
            }
            if (isSkip) continue
            n.next.push(next)
            insertNode(next, child)
        }
    }
    insertNode(node, graph)
    dot.addNode(node)
    fs.writeFileSync(path, dot.toString())
    output.appendLine('generate dot file: ' + path)
    return dot
}

function isNodeEqual(a: Node, b: Node) {
    return (
        a.name === b.name &&
        isDeepStrictEqual(a.attr, b.attr) &&
        isDeepStrictEqual(a.subgraph, b.subgraph)
    )
}

type Attr = Record<string, string> & {
    title?: string
    label?: string
    shape?: string
    style?: string
    color?: string
}

interface Node {
    name: string
    attr?: Attr
    subgraph?: Subgraph
    next: Node[]
}
interface Subgraph {
    name: string
    attr?: Attr & { node?: Attr }
    cluster?: boolean
}
class Graph {
    private _title: string
    private _isIncoming: boolean
    private _attrs: Attr = {}
    private _nodes = new Map<string, Node>()
    private _edges = new Set<string>()
    private _subgraphs = new Map<string, { attr?: Attr; nodes: Set<string> }>()

    constructor(isIncoming: boolean, title?: string) {
        this._isIncoming = isIncoming
        this._title = title ?? ''
    }

    addAttr(attr: Attr) {
        this._attrs = { ...this._attrs, ...attr }
    }

    addNode(...nodes: Node[]) {
        for (const node of nodes) {
            this.traverseAndCollect(node)
        }
    }

    private traverseAndCollect(node: Node) {
        if (this._nodes.has(node.name)) {
            return
        }
        this._nodes.set(node.name, node)

        if (node.subgraph) {
            const sgName = node.subgraph.name
            if (!this._subgraphs.has(sgName)) {
                this._subgraphs.set(sgName, {
                    attr: node.subgraph.attr,
                    nodes: new Set(),
                })
            }
            this._subgraphs.get(sgName)!.nodes.add(node.name)
        }

        const childrenNames = node.next.map(child => child.name)
        if (childrenNames.length > 0) {
            const childrenStr =
                childrenNames.length > 1
                    ? `{${childrenNames.join(' ')}}`
                    : childrenNames[0]
            const edge = this._isIncoming
                ? `${childrenStr} -> ${node.name}`
                : `${node.name} -> ${childrenStr}`
            this._edges.add(edge)
        }

        for (const child of node.next) {
            this.traverseAndCollect(child)
        }
    }

    private getAttr(attr?: Attr, isSelf = false, indent = '') {
        if (!attr || Object.keys(attr).length === 0) return ''
        if (isSelf) {
            return (
                Object.entries(attr)
                    .map(([k, v]) => `${indent}${k}="${v}";`)
                    .join('\n') + '\n'
            )
        } else {
            const attrs = Object.entries(attr)
                .map(([k, v]) => `${k}="${v}"`)
                .join(', ')
            return ` [${attrs}]`
        }
    }

    toString() {
        let dot = `digraph "${this._title}" {\n`

        // Graph attributes
        dot += this.getAttr(this._attrs, true, '    ')

        // Node definitions
        dot += '\n    // Nodes\n'
        for (const node of this._nodes.values()) {
            dot += `    ${node.name}${this.getAttr(node.attr)};\n`
        }

        // Subgraph definitions
        dot += '\n    // Subgraphs\n'
        for (const [sgName, sgData] of this._subgraphs.entries()) {
            dot += `    subgraph "cluster_${sgName}" {\n`
            dot += this.getAttr(sgData.attr, true, '        ')
            dot += `        ${[...sgData.nodes].join(' ')};\n`
            dot += `    }\n`
        }

        // Edge definitions
        dot += '\n    // Edges\n'
        for (const edge of this._edges) {
            dot += `    ${edge};\n`
        }

        dot += '}\n'
        return dot
    }
}
