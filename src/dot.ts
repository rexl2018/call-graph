import { CallHierarchyNode } from './call'
import * as fs from 'fs'
import * as vscode from 'vscode'
import { output } from './extension'

// 将映射和计数器移到函数外部，使它们可以在测试用例中共享
export const fileIdMap = new Map<string, number>()
export const funcIdMap = new Map<string, number>()
export let fileCounter = 1
export let funcCounter = 1

export function generateDot(
    graph: CallHierarchyNode,
    path: string,
    isIncoming: boolean,
    clickedNodeId?: string | null,
) {
    const dot = new Graph(isIncoming)
    const root = vscode.workspace.workspaceFolders?.[0].uri.path ?? ''

    // 仅当没有点击节点时才重置映射和计数器
    if (!clickedNodeId) {
        fileIdMap.clear()
        funcIdMap.clear()
        fileCounter = 1
        funcCounter = 1
    }

    dot.addAttr({ rankdir: isIncoming ? 'RL' : 'LR' })
    const nodeMap = new Map<string, Node>()

    const getOrCreateNode = (c: CallHierarchyNode): Node => {
        // Generate a unique key for the node based on its properties
        const filePath = c.item.uri.path
        const funcName = c.item.name
        const line = c.item.range.start.line
        const char = c.item.range.start.character
        if (!fileIdMap.has(filePath)) {
            fileIdMap.set(filePath, fileCounter++)
        }
        if (!funcIdMap.has(funcName)) {
            funcIdMap.set(funcName, funcCounter++)
        }
        const fileId = fileIdMap.get(filePath)
        const funcId = funcIdMap.get(funcName)
        const nodeId = `${fileId}_${funcId}_${line}_${char}`
        const nodeKey = `"${nodeId}"`

        // If node already exists, return it
        if (nodeMap.has(nodeKey)) {
            return nodeMap.get(nodeKey)!
        }

        // Otherwise, create a new node
        const newNode = {
            name: nodeKey,
            attr: { label: c.item.name },
            subgraph: {
                name: String(fileId),
                attr: { label: c.item.uri.path.replace(root, '${workspace}') },
            },
            next: [],
        } as Node

        // Add to map before processing children to handle cycles
        nodeMap.set(nodeKey, newNode)

        // Process children
        for (const child of c.children) {
            newNode.next.push(getOrCreateNode(child))
        }

        return newNode
    }

    const rootNode = getOrCreateNode(graph)
    dot.addNode(rootNode)

    if (clickedNodeId) {
        // 确保clickedNodeId格式与_nodes中的节点名称格式一致
        // 如果clickedNodeId不包含引号，则添加引号
        const formattedNodeId =
            clickedNodeId.startsWith('"') && clickedNodeId.endsWith('"')
                ? clickedNodeId
                : `"${clickedNodeId}"`
        output.appendLine(
            `点击的节点ID: ${clickedNodeId}, 格式化后: ${formattedNodeId}`,
        )
        dot.highlightSubgraph(formattedNodeId)
    } else if (clickedNodeId === undefined) {
        // undefined means we should not change the highlight status
        // which is useful for saving the dot file with current highlight
    } else {
        // null or empty string means we should reset the highlight
        dot.resetHighlight()
    }
    const dotContent = dot.toString()
    fs.writeFileSync(path, dotContent)
    output.appendLine('--- Start of DOT file content ---')
    output.appendLine(dotContent)
    output.appendLine('--- End of DOT file content ---')
    output.appendLine('Generated dot file: ' + path)
    return dot
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
    resetHighlight() {
        this._highlightedNodes.clear()
        this._highlightedEdges.clear()
        this._highlightedSubgraphs.clear()
    }

    // 获取高亮节点数量
    getHighlightedNodesCount() {
        return this._highlightedNodes.size
    }

    // 获取高亮边数量
    getHighlightedEdgesCount() {
        return this._highlightedEdges.size
    }

    // 获取高亮子图数量
    getHighlightedSubgraphsCount() {
        return this._highlightedSubgraphs.size
    }
    private _title: string
    private _isIncoming: boolean
    private _rootNodeName: string | null = null
    private _attrs: Attr = {}
    private _nodes = new Map<string, Node>()
    private _edges = new Set<string>()
    private _subgraphs = new Map<string, { attr?: Attr; nodes: Set<string> }>()
    private _adj = new Map<string, Set<string>>()
    private _revAdj = new Map<string, Set<string>>()
    private _nodeToSubgraphMap = new Map<string, string>()

    private _highlightedNodes = new Set<string>()
    private _highlightedEdges = new Set<string>()
    private _highlightedSubgraphs = new Set<string>()

    constructor(isIncoming: boolean, title?: string) {
        this._isIncoming = isIncoming
        this._title = title ?? ''
    }

    addAttr(attr: Attr) {
        this._attrs = { ...this._attrs, ...attr }
    }

    addNode(...nodes: Node[]) {
        for (const node of nodes) {
            // The first node added is considered the root of the entire call graph.
            if (this._rootNodeName === null) {
                this._rootNodeName = node.name
            }
            this.collectNodesAndSubgraphs(node)
        }
        const visited = new Set<string>()
        for (const node of nodes) {
            this.buildEdges(visited, node)
        }
    }

    highlightSubgraph(clickedNodeId: string) {
        this.resetHighlight()
        if (!this._nodes.has(clickedNodeId) || !this._rootNodeName) {
            console.error(
                `[ERROR] Node with ID ${clickedNodeId} or root node not found in graph.`,
            )
            return
        }

        const s = this._rootNodeName
        const t = clickedNodeId

        const reachableFromS = this._traverse(s, this._adj)
        const canReachT = this._traverse(t, this._revAdj)
        const pathNodes = new Set<string>()
        for (const node of reachableFromS) {
            if (canReachT.has(node)) {
                pathNodes.add(node)
            }
        }
        this._highlightedNodes = pathNodes

        for (const edgeStr of this._edges) {
            const parts = edgeStr.split(' -> ')
            const u = parts[0]
            const v = parts[1]
            if (
                this._highlightedNodes.has(u) &&
                this._highlightedNodes.has(v)
            ) {
                if (this._isIncoming) {
                    this._highlightedEdges.add(`${v} -> ${u}`)
                } else {
                    this._highlightedEdges.add(edgeStr)
                }
            }
        }

        for (const nodeId of this._highlightedNodes) {
            const subgraphName = this._nodeToSubgraphMap.get(nodeId)
            if (subgraphName) {
                this._highlightedSubgraphs.add(subgraphName)
            }
        }
    }

    private _traverse(
        startNode: string,
        adj: Map<string, Set<string>>,
    ): Set<string> {
        const visited = new Set<string>()
        const queue: string[] = [startNode]
        visited.add(startNode)

        while (queue.length > 0) {
            const u = queue.shift()!
            const neighbors = adj.get(u) || new Set()
            for (const v of neighbors) {
                if (!visited.has(v)) {
                    visited.add(v)
                    queue.push(v)
                }
            }
        }
        return visited
    }

    private collectNodesAndSubgraphs(node: Node) {
        if (this._nodes.has(node.name)) {
            return
        }
        this._nodes.set(node.name, node)

        if (node.subgraph) {
            const sgName = node.subgraph.name
            this._nodeToSubgraphMap.set(node.name, sgName)
            if (!this._subgraphs.has(sgName)) {
                this._subgraphs.set(sgName, {
                    attr: node.subgraph.attr,
                    nodes: new Set(),
                })
            }
            this._subgraphs.get(sgName)!.nodes.add(node.name)
        }

        for (const child of node.next) {
            this.collectNodesAndSubgraphs(child)
        }
    }

    private buildEdges(visited: Set<string>, node: Node) {
        if (visited.has(node.name)) return
        visited.add(node.name)

        if (!this._adj.has(node.name)) this._adj.set(node.name, new Set())

        for (const child of node.next) {
            // Logical edge is always from node to child (caller to callee)
            const from = node.name // Quoted
            const to = child.name // Quoted

            if (!this._adj.has(from)) this._adj.set(from, new Set())
            if (!this._adj.get(from)!.has(to)) {
                this._adj.get(from)!.add(to)

                if (!this._revAdj.has(to)) this._revAdj.set(to, new Set())
                this._revAdj.get(to)!.add(from)

                const edgeStr = `${from} -> ${to}`
                this._edges.add(edgeStr)
            }

            this.buildEdges(visited, child)
        }
    }

    private getAttr(attr?: Attr) {
        if (!attr || Object.keys(attr).length === 0) return ''
        const attrs = Object.entries(attr)
            .map(([k, v]) => `${k}="${v}"`)
            .join(', ')
        return ` [${attrs}]`
    }

    toString(): string {
        const isHighlighting = this._highlightedNodes.size > 0
        return this.render(isHighlighting)
    }

    private render(isHighlighting: boolean): string {
        const nodesToRender = isHighlighting
            ? this._highlightedNodes
            : new Set(this._nodes.keys())

        // 处理边的方向
        let edgesToRender: Set<string>
        if (isHighlighting) {
            edgesToRender = this._highlightedEdges
        } else if (this._isIncoming) {
            // 在incoming模式下，如果没有高亮节点，需要反转所有边的方向
            edgesToRender = new Set<string>()
            for (const edgeStr of this._edges) {
                const parts = edgeStr.split(' -> ')
                const u = parts[0]
                const v = parts[1]
                edgesToRender.add(`${v} -> ${u}`)
            }
        } else {
            edgesToRender = this._edges
        }

        // When highlighting, we only want to show subgraphs that contain highlighted nodes.
        const subgraphsToRender = isHighlighting
            ? this._highlightedSubgraphs
            : new Set(this._subgraphs.keys())

        const lines: string[] = []
        lines.push(`digraph "${this._title}" {`)

        // Add graph attributes
        const graphAttrs = Object.entries(this._attrs)
            .map(([k, v]) => `${k}="${v}";`)
            .join(' ')
        lines.push(`graph [${graphAttrs}];`)
        lines.push(`node [shape="box", style="rounded"];`)

        const renderedNodes = new Set<string>()

        // Render subgraphs
        for (const subgraphName of subgraphsToRender) {
            const subgraph = this._subgraphs.get(subgraphName)
            if (!subgraph) continue

            lines.push(`subgraph "cluster_${subgraphName}" {`)
            if (subgraph.attr) {
                const subgraphAttrs = Object.entries(subgraph.attr)
                    .map(([k, v]) => `${k}="${v}";`)
                    .join(' ')
                lines.push(subgraphAttrs)
            }

            for (const nodeName of subgraph.nodes) {
                if (this._highlightedNodes.has(nodeName)) {
                    const node = this._nodes.get(nodeName)!
                    const nodeAttrs: Attr = { ...node.attr }
                    nodeAttrs.color = 'blue'
                    nodeAttrs.style = 'filled,bold'
                    nodeAttrs.fillcolor = '#E0E0FF'
                    lines.push(`${node.name}${this.getAttr(nodeAttrs)};`)
                    renderedNodes.add(nodeName)
                }
            }
            lines.push('}')
        }

        // Render nodes not in any rendered subgraph
        for (const nodeName of nodesToRender) {
            if (!renderedNodes.has(nodeName)) {
                const node = this._nodes.get(nodeName)!
                const nodeAttrs: Attr = { ...node.attr }
                if (this._highlightedNodes.has(nodeName)) {
                    nodeAttrs.color = 'blue'
                    nodeAttrs.style = 'filled,bold'
                    nodeAttrs.fillcolor = '#E0E0FF'
                }
                lines.push(`${nodeName}${this.getAttr(nodeAttrs)};`)
            }
        }

        // Render edges
        for (const edge of edgesToRender) {
            const edgeAttrs: Attr = {}
            if (this._highlightedEdges.has(edge)) {
                edgeAttrs.color = 'blue'
                edgeAttrs['penwidth'] = '2.0'
            } else {
                edgeAttrs.color = 'black'
            }
            lines.push(`${edge}${this.getAttr(edgeAttrs)};`)
        }

        lines.push('}')
        return lines.join('\n')
    }
}

// 导出一个独立的getNodeId函数，用于测试用例中获取节点ID
export function getNodeId(n: CallHierarchyNode) {
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
    return nodeId
}
