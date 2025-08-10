import { CallHierarchyNode } from './call'
import * as fs from 'fs'
import * as vscode from 'vscode'
import { isDeepStrictEqual } from 'util'
import { output } from './extension'

export function generateDot(
    graph: CallHierarchyNode,
    path: string,
    isIncoming: boolean,
    clickedNodeId?: string | null,
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
    console.log(
        `[DEBUG] generateDot: clickedNodeId=${clickedNodeId}, isIncoming=${isIncoming}`,
    )
    // 打印当前高亮状态
    console.log(
        `[DEBUG] generateDot: 当前高亮状态 - 节点数量=${dot.getHighlightedNodesCount()}, 边数量=${dot.getHighlightedEdgesCount()}, 子图数量=${dot.getHighlightedSubgraphsCount()}`,
    )

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
        console.log(
            `[DEBUG] generateDot: 高亮子图，formattedNodeId=${formattedNodeId}`,
        )
        dot.highlightSubgraph(formattedNodeId)
        console.log(
            `[DEBUG] generateDot: 高亮后 - 节点数量=${dot.getHighlightedNodesCount()}, 边数量=${dot.getHighlightedEdgesCount()}, 子图数量=${dot.getHighlightedSubgraphsCount()}`,
        )
    } else if (clickedNodeId === undefined) {
        // undefined means we should not change the highlight status
        // which is useful for saving the dot file with current highlight
        console.log(
            `[DEBUG] generateDot: 保持当前高亮状态 - 节点数量=${dot.getHighlightedNodesCount()}, 边数量=${dot.getHighlightedEdgesCount()}, 子图数量=${dot.getHighlightedSubgraphsCount()}`,
        )
    } else {
        // null or empty string means we should reset the highlight
        console.log(`[DEBUG] generateDot: 重置高亮状态`)
        dot.resetHighlight()
        console.log(
            `[DEBUG] generateDot: 重置后 - 节点数量=${dot.getHighlightedNodesCount()}, 边数量=${dot.getHighlightedEdgesCount()}, 子图数量=${dot.getHighlightedSubgraphsCount()}`,
        )
    }
    const dotContent = dot.toString()
    fs.writeFileSync(path, dotContent)
    output.appendLine('--- Start of DOT file content ---')
    output.appendLine(dotContent)
    output.appendLine('--- End of DOT file content ---')
    output.appendLine('Generated dot file: ' + path)
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
            this.collectNodesAndSubgraphs(node)
        }
        const visited = new Set<string>()
        for (const node of nodes) {
            this.buildEdges(visited, node)
        }
    }

    highlightSubgraph(startNodeId: string) {
        // 检查节点是否存在于_nodes集合中
        if (!this._nodes.has(startNodeId)) {
            output.appendLine(
                `警告：找不到节点ID: ${startNodeId}，无法高亮子图`,
            )
            output.appendLine(
                `现有节点列表: ${[...this._nodes.keys()].join(', ')}`,
            )
            return
        }

        output.appendLine(
            `开始高亮子图，起始节点ID: ${startNodeId}，图类型: ${this._isIncoming ? 'incoming' : 'outgoing'}`,
        )

        const nodesToHighlight = new Set<string>()
        const edgesToHighlight = new Set<string>()
        const queue: string[] = [startNodeId]
        const visited = new Set<string>()

        // For incoming, we traverse forwards (adj) to find callees.
        // For outgoing, we traverse backwards (revAdj) to find callers.
        // 根据文档规则：
        // - incoming图：从被点击节点开始，向下游追溯所有被调用者
        // - outgoing图：从被点击节点开始，向上游追溯所有调用者
        const adj = this._isIncoming ? this._adj : this._revAdj
        output.appendLine(
            `使用${this._isIncoming ? '正向' : '反向'}邻接表进行遍历`,
        )
        output.appendLine(
            `邻接表内容: ${[...adj.entries()].map(([k, v]) => `${k} -> [${[...v].join(', ')}]`).join('\n')}`,
        )

        while (queue.length > 0) {
            const currNodeId = queue.shift()!
            if (visited.has(currNodeId)) {
                continue
            }
            visited.add(currNodeId)
            nodesToHighlight.add(currNodeId)

            const neighbors = adj.get(currNodeId) || new Set()
            output.appendLine(
                `处理节点: ${currNodeId}, 找到${neighbors.size}个${this._isIncoming ? '被调用者' : '调用者'}`,
            )

            for (const neighborId of neighbors) {
                // 根据文档规则：
                // - incoming图：从被点击节点开始，向下游追溯所有被调用者
                // - outgoing图：从被点击节点开始，向上游追溯所有调用者
                // 对于incoming图，边是从当前节点(caller)到邻居节点(callee)
                // 对于outgoing图，边是从邻居节点(caller)到当前节点(callee)
                // 检查节点名称是否已经包含引号，避免重复添加
                const fromId = this._isIncoming ? currNodeId : neighborId
                const toId = this._isIncoming ? neighborId : currNodeId
                // 构造边字符串时添加引号，保持与buildEdges方法中的格式一致
                const fromStr =
                    fromId.startsWith('"') && fromId.endsWith('"')
                        ? fromId
                        : `"${fromId}"`
                const toStr =
                    toId.startsWith('"') && toId.endsWith('"')
                        ? toId
                        : `"${toId}"`
                const edge = `${fromStr} -> ${toStr}`
                edgesToHighlight.add(edge)
                output.appendLine(`添加边: ${edge}`)

                if (!visited.has(neighborId)) {
                    nodesToHighlight.add(neighborId) // Also highlight the neighbor node
                    queue.push(neighborId)
                    output.appendLine(`将节点 ${neighborId} 加入队列`)
                }
            }
        }

        this._highlightedNodes = nodesToHighlight
        this._highlightedEdges = edgesToHighlight

        output.appendLine(
            `高亮计算完成，共有${nodesToHighlight.size}个节点和${edgesToHighlight.size}个边被高亮`,
        )
        output.appendLine('高亮节点列表:')
        output.appendLine([...nodesToHighlight].join(', '))

        for (const nodeId of this._highlightedNodes) {
            const subgraph = this._nodeToSubgraphMap.get(nodeId)
            if (subgraph) {
                this._highlightedSubgraphs.add(subgraph)
                output.appendLine(
                    `节点 ${nodeId} 属于子图 ${subgraph}，将子图添加到高亮列表`,
                )
            }
        }

        output.appendLine(`共有${this._highlightedSubgraphs.size}个子图被高亮`)
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
            const [from, to] = this._isIncoming
                ? [child.name, node.name]
                : [node.name, child.name]

            if (!this._adj.has(from)) this._adj.set(from, new Set())
            if (!this._adj.get(from)!.has(to)) {
                this._adj.get(from)!.add(to)

                if (!this._revAdj.has(to)) this._revAdj.set(to, new Set())
                this._revAdj.get(to)!.add(from)

                // 检查节点名称是否已经包含引号，避免重复添加
                const fromStr =
                    from.startsWith('"') && from.endsWith('"')
                        ? from
                        : `"${from}"`
                const toStr =
                    to.startsWith('"') && to.endsWith('"') ? to : `"${to}"`
                const edgeStr = `${fromStr} -> ${toStr}`
                this._edges.add(edgeStr)
            }

            this.buildEdges(visited, child)
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
        const hasHighlight = this._highlightedNodes.size > 0
        console.log(
            `[DEBUG] toString: hasHighlight=${hasHighlight}, highlightedNodes=${this._highlightedNodes.size}, highlightedEdges=${this._highlightedEdges.size}, highlightedSubgraphs=${this._highlightedSubgraphs.size}`,
        )

        // 打印部分高亮节点和边的信息，用于调试
        if (hasHighlight) {
            const nodeSample = [...this._highlightedNodes]
                .slice(0, 3)
                .join(', ')
            const edgeSample = [...this._highlightedEdges]
                .slice(0, 3)
                .join(', ')
            console.log(`[DEBUG] toString: 高亮节点示例: ${nodeSample}`)
            console.log(`[DEBUG] toString: 高亮边示例: ${edgeSample}`)
        }

        let dot = `digraph "${this._title}" {\n`

        // Graph attributes
        dot += this.getAttr(this._attrs, true, '    ')

        // Node definitions
        dot += '\n    // Nodes\n'
        const nodesToRender = hasHighlight
            ? [...this._highlightedNodes]
            : [...this._nodes.keys()]
        for (const nodeName of nodesToRender) {
            const node = this._nodes.get(nodeName)
            if (!node) continue

            const nodeAttr = { ...node.attr }
            if (this._highlightedNodes.has(node.name)) {
                nodeAttr.color = 'blue'
                nodeAttr.penwidth = '3' // 增加高亮节点的边框粗细
            }
            dot += `    ${node.name}${this.getAttr(nodeAttr)};\n`
        }

        // Subgraph definitions
        dot += '\n    // Subgraphs\n'
        const subgraphsToRender = hasHighlight
            ? [...this._highlightedSubgraphs]
            : [...this._subgraphs.keys()]

        for (const sgName of subgraphsToRender) {
            const sgData = this._subgraphs.get(sgName)
            if (!sgData) continue

            const nodesInSubgraph = [...sgData.nodes].filter(nodeName =>
                hasHighlight ? this._highlightedNodes.has(nodeName) : true,
            )

            // Only render subgraph if it contains nodes to render
            if (nodesInSubgraph.length > 0) {
                dot += `    subgraph "cluster_${sgName}" {\n`

                const graphAttrs: Attr = {}
                if (sgData.attr?.label) {
                    graphAttrs.label = sgData.attr.label
                }

                if (this._highlightedSubgraphs.has(sgName)) {
                    graphAttrs.color = 'blue'
                    graphAttrs.penwidth = '3' // 增加高亮子图的边框粗细
                }

                if (Object.keys(graphAttrs).length > 0) {
                    dot += `        graph${this.getAttr(graphAttrs)};\n`
                }

                dot += `        ${nodesInSubgraph.join(' ')};\n`
                dot += `    }\n`
            }
        }

        // Edge definitions
        dot += '\n    // Edges\n'
        const edgesToRender = hasHighlight
            ? this._highlightedEdges
            : this._edges
        console.log(
            `[DEBUG] toString: 要渲染的边数量=${edgesToRender.size}, 是否只渲染高亮边=${hasHighlight}`,
        )

        let edgeCount = 0
        for (const edge of edgesToRender) {
            const edgeAttr: Attr = {}
            if (this._highlightedEdges.has(edge)) {
                edgeAttr.color = 'blue'
                edgeAttr.penwidth = '3' // 增加高亮边的边框粗细
                console.log(`[DEBUG] toString: 添加高亮边属性 - ${edge}`)
            }
            dot += `    ${edge}${this.getAttr(edgeAttr)};\n`
            edgeCount++

            // 只打印前几条边的信息，避免日志过多
            if (edgeCount <= 5) {
                console.log(
                    `[DEBUG] toString: 添加边 #${edgeCount} - ${edge}${this.getAttr(edgeAttr)}`,
                )
            }
        }
        console.log(`[DEBUG] toString: 总共添加了 ${edgeCount} 条边`)

        dot += '}\n'
        return dot
    }
}
