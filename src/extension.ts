import * as vscode from 'vscode'
import {
    CallHierarchyNode,
    getIncomingCallNode,
    getOutgoingCallNode,
} from './call'
import { generateDot } from './dot'
import { generateMermaid } from './mermaid'
import * as path from 'path'
import * as fs from 'fs'
import ignore from 'ignore'

export const output = vscode.window.createOutputChannel('CallGraph')

interface WebviewMsg {
    command: string
    type?: 'dot' | 'svg'
    data?: string
    nodeId?: string
    isIncoming?: boolean
}

const getDefaultProgressOptions = (title: string): vscode.ProgressOptions => {
    return {
        location: vscode.ProgressLocation.Notification,
        title,
        cancellable: true,
    }
}

const getHtmlContent = (
    staticDir: string,
    dotFileUri: string,
    d3Uri: string,
    d3GraphvizUri: string,
    graphInteractionUri: string,
    graphStylesUri: string,
    isIncoming: boolean,
) => {
    return fs
        .readFileSync(path.resolve(staticDir, 'index.html'))
        .toString()
        .split('$DOT_FILE_URI')
        .join(dotFileUri)
        .split('$D3_URI')
        .join(d3Uri)
        .split('$D3_GRAPHVIZ_URI')
        .join(d3GraphvizUri)
        .split('$GRAPH_INTERACTION_URI')
        .join(graphInteractionUri)
        .split('$GRAPH_STYLES_URI')
        .join(graphStylesUri)
        .replace('$IS_INCOMING', String(isIncoming))
}

const onReceiveMsgFactory =
    (
        type: 'Incoming' | 'Outgoing',
        graph: CallHierarchyNode | null,
        dotFile: vscode.Uri | null,
        panel: vscode.WebviewPanel,
        isIncoming: boolean,
    ) =>
    (msg: WebviewMsg) => {
        const savedName =
            type === 'Incoming' ? 'call_graph_incoming' : 'call_graph_outgoing'

        if (msg.command === 'download' && msg.type && msg.data) {
            const onDowload = async (fileType: 'dot' | 'svg' | 'mermaid') => {
                const workspace = vscode.workspace.workspaceFolders?.[0].uri
                if (!workspace) return
                const f = await vscode.window.showSaveDialog({
                    filters:
                        fileType === 'svg'
                            ? { Image: ['svg'] }
                            : fileType === 'mermaid'
                              ? { Mermaid: ['mmd', 'md'] }
                              : { Graphviz: ['dot', 'gv'] },
                    defaultUri: vscode.Uri.joinPath(
                        workspace,
                        `${savedName}.${fileType === 'mermaid' ? 'mmd' : fileType}`,
                    ),
                })
                if (!f) return

                let fileContent = msg.data
                if (fileType === 'dot' && graph && dotFile) {
                    // Regenerate dot content to respect highlight status
                    generateDot(
                        graph,
                        dotFile.fsPath,
                        isIncoming,
                        msg.nodeId || undefined,
                    )
                    fileContent = fs.readFileSync(dotFile.fsPath).toString()
                } else if (fileType === 'mermaid' && graph) {
                    // Generate Mermaid content directly from the graph data
                    fileContent = generateMermaid(
                        graph,
                        isIncoming,
                        msg.nodeId || undefined,
                    )
                }

                if (fileContent) {
                    fs.writeFileSync(f.fsPath, fileContent)
                }
                vscode.window.showInformationMessage(
                    `Call Graph ${fileType} file saved: ` + f.fsPath,
                )
            }
            onDowload(msg.type)
        } else if (
            msg.command === 'nodeClicked' &&
            msg.nodeId &&
            graph &&
            dotFile
        ) {
            output.appendLine(
                `Node clicked: ${msg.nodeId}, regenerating graph...`,
            )
            generateDot(graph, dotFile.fsPath, isIncoming, msg.nodeId)
            // Regenerate dot and update webview
            const dotContent = fs.readFileSync(dotFile.fsPath).toString()
            panel.webview.postMessage({
                command: 'updateGraph',
                dot: dotContent,
            })
            output.appendLine('Graph updated and sent to webview.')
        } else if (msg.command === 'resetClicked' && graph && dotFile) {
            generateDot(graph, dotFile.fsPath, isIncoming, null)
            const dotContent = fs.readFileSync(dotFile.fsPath).toString()
            panel.webview.postMessage({
                command: 'updateGraph',
                dot: dotContent,
            })
        }
    }

const generateGraph = (
    type: 'Incoming' | 'Outgoing',
    callNodeFunction: (
        entryItem: vscode.CallHierarchyItem,
        ignore: (item: vscode.CallHierarchyItem) => boolean,
    ) => Promise<CallHierarchyNode>,
    dotFile: vscode.Uri,
    staticDir: string,
) => {
    return async () => {
        const activeTextEditor = vscode.window.activeTextEditor
        if (!activeTextEditor) {
            vscode.window.showErrorMessage("Can't get active text editor")
            return
        }

        const entry: vscode.CallHierarchyItem[] =
            await vscode.commands.executeCommand(
                'vscode.prepareCallHierarchy',
                activeTextEditor.document.uri,
                activeTextEditor.selection.active,
            )
        if (!entry || !entry[0]) {
            vscode.window.showErrorMessage("Can't resolve entry function")
            return
        }

        const workspace = vscode.workspace.workspaceFolders?.[0].uri
        if (!workspace) {
            vscode.window.showErrorMessage("Can't get workspace uri")
            return
        }

        let ignoreFile: string | null =
            vscode.workspace
                .getConfiguration()
                .get<string>('call-graph.ignoreFile')
                ?.replace('${workspace}', workspace.fsPath) ?? null

        if (ignoreFile && !fs.existsSync(ignoreFile)) ignoreFile = null
        const graph = await callNodeFunction(entry[0], item => {
            if (ignoreFile === null) return false
            // working in the current workspace
            if (!item.uri.fsPath.startsWith(workspace.fsPath)) return true
            const ig = ignore().add(fs.readFileSync(ignoreFile).toString())
            const itemPath = item.uri.path.replace(`${workspace.path}/`, '')
            const ignored = ig.test(itemPath).ignored
            return ignored
        })

        generateDot(graph, dotFile.fsPath, type === 'Incoming')

        const webviewType = `CallGraph.preview${type}`
        const panel = vscode.window.createWebviewPanel(
            webviewType,
            `Call Graph ${type}`,
            vscode.ViewColumn.Beside,
            {
                localResourceRoots: [
                    vscode.Uri.file(staticDir),
                    vscode.Uri.joinPath(vscode.Uri.file(staticDir), 'lib'),
                    vscode.Uri.file(
                        path.join(path.dirname(staticDir), 'node_modules'),
                    ),
                ],
                enableScripts: true,
            },
        )

        // 获取webview资源URI
        const dotFileUri = panel.webview.asWebviewUri(dotFile).toString()
        const d3Uri = panel.webview
            .asWebviewUri(
                vscode.Uri.joinPath(
                    vscode.Uri.file(staticDir),
                    'lib/d3/d3.min.js',
                ),
            )
            .toString()
        const d3GraphvizUri = panel.webview
            .asWebviewUri(
                vscode.Uri.joinPath(
                    vscode.Uri.file(staticDir),
                    'lib/d3-graphviz/d3-graphviz.min.js',
                ),
            )
            .toString()

        const graphInteractionUri = panel.webview
            .asWebviewUri(
                vscode.Uri.joinPath(
                    vscode.Uri.file(staticDir),
                    'graph-interaction.js',
                ),
            )
            .toString()
        const graphStylesUri = panel.webview
            .asWebviewUri(
                vscode.Uri.joinPath(
                    vscode.Uri.file(staticDir),
                    'graph-styles.css',
                ),
            )
            .toString()

        panel.webview.html = getHtmlContent(
            staticDir,
            dotFileUri,
            d3Uri,
            d3GraphvizUri,
            graphInteractionUri,
            graphStylesUri,
            type === 'Incoming',
        )
        const onReceiveMsg = onReceiveMsgFactory(
            type,
            graph,
            dotFile,
            panel,
            type === 'Incoming',
        )
        panel.webview.onDidReceiveMessage(onReceiveMsg)
    }
}

const registerWebviewPanelSerializer = (
    staticDir: string,
    webViewType: string,
) => {
    vscode.window.registerWebviewPanelSerializer(webViewType, {
        async deserializeWebviewPanel(
            webviewPanel: vscode.WebviewPanel,
            state: string,
        ) {
            if (!state) {
                vscode.window.showErrorMessage(
                    'CallGraph: fail to load previous state',
                )
                return
            }

            // 配置webview资源根目录
            webviewPanel.webview.options = {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.file(staticDir),
                    vscode.Uri.joinPath(vscode.Uri.file(staticDir), 'lib'),
                    vscode.Uri.file(
                        path.join(path.dirname(staticDir), 'node_modules'),
                    ),
                ],
            }

            // This part needs to be adapted to handle the new logic, but for now, we'll keep it simple
            // as deserialization might not be fully compatible with the new interactive features without more state.
            webviewPanel.webview.html = `<body>Restore not fully supported for interactive graphs yet. Please regenerate the graph.</body>`

            // Deserialization doesn't have the graph context, so node clicking won't work.
            // We can pass a limited message handler.
            const type = webViewType.includes('Incoming')
                ? 'Incoming'
                : 'Outgoing'
            webviewPanel.webview.onDidReceiveMessage(
                onReceiveMsgFactory(
                    type,
                    null,
                    null,
                    webviewPanel,
                    type === 'Incoming',
                ),
            )
        },
    })
}

export function activate(context: vscode.ExtensionContext) {
    // 不需要显式初始化WASM模块，@hpcc-js/wasm会自动加载

    const staticDir = path.resolve(context.extensionPath, 'static')
    if (!fs.existsSync(staticDir)) fs.mkdirSync(staticDir)

    const workspace = vscode.workspace.workspaceFolders?.[0].uri
    if (!workspace) {
        vscode.window.showErrorMessage("Can't get workspace uri")
        return
    }

    const dotFileOutgoing = vscode.Uri.file(
        path.resolve(staticDir, 'graph_data_outgoing.dot'),
    )
    const dotFileIncoming = vscode.Uri.file(
        path.resolve(staticDir, 'graph_data_incoming.dot'),
    )

    // 注册新的预览命令
    context.subscriptions.push(
        vscode.commands.registerCommand('call-graph.preview', async () => {
            const panel = vscode.window.createWebviewPanel(
                'callGraphPreview',
                'Call Graph Preview',
                vscode.ViewColumn.Beside,
                {
                    enableScripts: true,
                    localResourceRoots: [
                        vscode.Uri.joinPath(context.extensionUri, 'static'),
                        vscode.Uri.joinPath(
                            context.extensionUri,
                            'node_modules',
                        ),
                    ],
                },
            )

            // 获取webview资源URI
            const d3Uri = panel.webview
                .asWebviewUri(
                    vscode.Uri.joinPath(
                        context.extensionUri,
                        'static/lib/d3/d3.min.js',
                    ),
                )
                .toString()
            const d3GraphvizUri = panel.webview
                .asWebviewUri(
                    vscode.Uri.joinPath(
                        context.extensionUri,
                        'static/lib/d3-graphviz/d3-graphviz.min.js',
                    ),
                )
                .toString()

            const testScriptUri = panel.webview
                .asWebviewUri(
                    vscode.Uri.joinPath(
                        context.extensionUri,
                        'static/test-d3.js',
                    ),
                )
                .toString()

            // 使用示例DOT内容进行测试
            const sampleDotContent = 'digraph G { A -> B -> C; B -> D; }'

            const graphInteractionUri = panel.webview
                .asWebviewUri(
                    vscode.Uri.joinPath(
                        vscode.Uri.file(staticDir),
                        'graph-interaction.js',
                    ),
                )
                .toString()
            const graphStylesUri = panel.webview
                .asWebviewUri(
                    vscode.Uri.joinPath(
                        vscode.Uri.file(staticDir),
                        'graph-styles.css',
                    ),
                )
                .toString()

            // 构建HTML内容
            let html = getHtmlContent(
                staticDir,
                'data:text/plain;charset=utf-8,' +
                    encodeURIComponent(sampleDotContent),
                d3Uri,
                d3GraphvizUri,
                graphInteractionUri,
                graphStylesUri,
                false, // isIncoming
            )

            // 添加测试脚本
            html = html.replace(
                '</body>',
                `<script src="${testScriptUri}"></script></body>`,
            )

            panel.webview.html = html

            // 添加消息处理
            panel.webview.onDidReceiveMessage(msg => {
                console.log('Received message from webview:', msg)
            })
        }),
    )

    const incomingDisposable = vscode.commands.registerCommand(
        'CallGraph.showIncomingCallGraph',
        async () => {
            vscode.window.withProgress(
                getDefaultProgressOptions('Generate call graph'),
                generateGraph(
                    'Incoming',
                    getIncomingCallNode,
                    dotFileIncoming,
                    staticDir,
                ),
            )
        },
    )
    const outgoingDisposable = vscode.commands.registerCommand(
        'CallGraph.showOutgoingCallGraph',
        async () => {
            vscode.window.withProgress(
                getDefaultProgressOptions('Generate call graph'),
                generateGraph(
                    'Outgoing',
                    getOutgoingCallNode,
                    dotFileOutgoing,
                    staticDir,
                ),
            )
        },
    )
    registerWebviewPanelSerializer(staticDir, `CallGraph.previewIncoming`)
    registerWebviewPanelSerializer(staticDir, 'CallGraph.previewOutgoing')
    context.subscriptions.push(incomingDisposable)
    context.subscriptions.push(outgoingDisposable)
}
