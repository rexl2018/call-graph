import * as vscode from 'vscode'
import {
    CallHierarchyNode,
    getIncomingCallNode,
    getOutgoingCallNode,
} from './call'
import { generateDot } from './dot'
import * as path from 'path'
import * as fs from 'fs'
import ignore from 'ignore'

export const output = vscode.window.createOutputChannel('CallGraph')

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
}
const generateGraph = (
    type: 'Incoming' | 'Outgoing',
    callNodeFunction: (
        entryItem: vscode.CallHierarchyItem,
        ignore: (item: vscode.CallHierarchyItem) => boolean,
    ) => Promise<CallHierarchyNode>,
    dotFile: vscode.Uri,
    staticDir: string,
    onReceiveMsg: (msg: WebviewMsg) => void,
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
        )
        panel.webview.onDidReceiveMessage(onReceiveMsg)
    }
}

interface WebviewMsg {
    command: string
    type: 'dot' | 'svg'
    data: string
}

const registerWebviewPanelSerializer = (
    staticDir: string,
    webViewType: string,
    onReceiveMsg: (msg: WebviewMsg) => void,
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

            // 获取webview资源URI
            const d3Uri = webviewPanel.webview
                .asWebviewUri(
                    vscode.Uri.joinPath(
                        vscode.Uri.file(staticDir),
                        'lib/d3/d3.min.js',
                    ),
                )
                .toString()
            const d3GraphvizUri = webviewPanel.webview
                .asWebviewUri(
                    vscode.Uri.joinPath(
                        vscode.Uri.file(staticDir),
                        'lib/d3-graphviz/d3-graphviz.min.js',
                    ),
                )
                .toString()

            const graphInteractionUri = webviewPanel.webview
                .asWebviewUri(
                    vscode.Uri.joinPath(
                        vscode.Uri.file(staticDir),
                        'graph-interaction.js',
                    ),
                )
                .toString()
            const graphStylesUri = webviewPanel.webview
                .asWebviewUri(
                    vscode.Uri.joinPath(
                        vscode.Uri.file(staticDir),
                        'graph-styles.css',
                    ),
                )
                .toString()

            webviewPanel.webview.html = getHtmlContent(
                staticDir,
                state,
                d3Uri,
                d3GraphvizUri,
                graphInteractionUri,
                graphStylesUri,
            )
            webviewPanel.webview.onDidReceiveMessage(onReceiveMsg)
        },
    })
}

export async function activate(context: vscode.ExtensionContext) {
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

    const onReceiveMsgFactory =
        (type: 'Incoming' | 'Outgoing') => (msg: WebviewMsg) => {
            const savedName =
                type === 'Incoming'
                    ? 'call_graph_incoming'
                    : 'call_graph_outgoing'
            if (msg.command === 'download') {
                const onDowload = async (fileType: 'dot' | 'svg') => {
                    const f = await vscode.window.showSaveDialog({
                        filters:
                            fileType === 'svg'
                                ? { Image: ['svg'] }
                                : { Graphviz: ['dot', 'gv'] },
                        defaultUri: vscode.Uri.joinPath(
                            workspace,
                            `${savedName}.${fileType}`,
                        ),
                    })
                    if (!f) return
                    fs.writeFileSync(f.fsPath, msg.data)
                    vscode.window.showInformationMessage(
                        'Call Graph file saved: ' + f.fsPath,
                    )
                }
                onDowload(msg.type)
            }
        }
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
                    onReceiveMsgFactory('Incoming'),
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
                    onReceiveMsgFactory('Outgoing'),
                ),
            )
        },
    )
    registerWebviewPanelSerializer(
        staticDir,
        `CallGraph.previewIncoming`,
        onReceiveMsgFactory('Incoming'),
    )
    registerWebviewPanelSerializer(
        staticDir,
        'CallGraph.previewOutgoing',
        onReceiveMsgFactory('Outgoing'),
    )
    context.subscriptions.push(incomingDisposable)
    context.subscriptions.push(outgoingDisposable)
}
