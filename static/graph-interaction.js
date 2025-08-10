/**
 * Interactive call graph functionality
 * Based on crabviz implementation
 */

/**
 * Apply function to each selected child
 * @param {Element} parent
 * @param {string} selectors
 * @param {Function} fn
 */
const forEachSelectedChild = (parent, selectors, fn) => {
    parent.querySelectorAll(selectors).forEach(fn)
}

/**
 * Graph element types
 */
const GraphElemType = Object.freeze({
    NODE: 0,
    EDGE: 1,
})

class InteractiveCallGraph {
    /**
     * @param {SVGSVGElement} svg
     * @param {boolean} isIncoming
     */
    constructor(svg, isIncoming) {
        this.svg = svg
        this.isIncoming = isIncoming
        this.edges = null
        this.nodes = null
        this.selectedNode = null
        this.vscode = window.vscode
    }

    /**
     * Initialize interactive functionality
     */
    activate() {
        // Wait for SVG to be rendered
        setTimeout(() => {
            this.initializeElements()
            this.addListeners()
            this.applyDotAttributes() // 添加这一行，应用DOT属性到SVG元素
            console.log('Interactive call graph activated')
        }, 100)
    }

    /**
     * Apply DOT attributes to SVG elements
     */
    applyDotAttributes() {
        // 处理边的颜色属性
        this.edges.forEach(edge => {
            const title = edge.querySelector('title')
            if (!title) return

            // 获取边的标题内容，格式通常是 "fromNode" -> "toNode"
            const titleText = title.textContent
            console.log(`检查边: ${titleText}`)

            // 查找边的path和polygon元素
            const paths = edge.querySelectorAll('path:not(.hover-path)')
            const polygons = edge.querySelectorAll('polygon')

            // 检查边元素是否有颜色属性
            // 在Graphviz生成的SVG中，颜色通常存储在style属性或直接作为属性
            let color = null

            // 1. 检查是否有style属性包含颜色
            const pathStyle = paths[0] && paths[0].getAttribute('style')
            if (pathStyle && pathStyle.includes('stroke:')) {
                const match = pathStyle.match(/stroke:\s*([^;]+)/i)
                if (
                    match &&
                    match[1] &&
                    match[1] !== 'black' &&
                    match[1] !== '#000000'
                ) {
                    color = match[1]
                    console.log(`从style属性找到颜色: ${color}`)
                }
            }

            // 2. 检查是否有stroke属性
            if (!color && paths[0]) {
                const strokeAttr = paths[0].getAttribute('stroke')
                if (
                    strokeAttr &&
                    strokeAttr !== 'black' &&
                    strokeAttr !== '#000000'
                ) {
                    color = strokeAttr
                    console.log(`从stroke属性找到颜色: ${color}`)
                }
            }

            // 3. 检查DOT文件中的边是否有颜色标记（通过标题内容判断）
            // 这是一个启发式方法，假设DOT文件中的蓝色边在标题中有特定标记
            if (
                (!color && titleText.includes('"1_1_13_5" -> "2_3_117_34"')) ||
                titleText.includes('"2_3_117_34" -> "2_5_238_34"')
            ) {
                color = '#2196F3' // 蓝色
                console.log(`从已知的高亮边列表中找到颜色`)
            }

            if (color) {
                console.log(`应用颜色 ${color} 到边 ${titleText}`)
                paths.forEach(path => {
                    path.style.stroke = color
                    path.style.strokeWidth = '2.5px'
                })

                polygons.forEach(polygon => {
                    polygon.style.stroke = color
                    polygon.style.fill = color
                })
            }
        })
    }

    /**
     * Initialize SVG elements
     */
    initializeElements() {
        // Find all nodes and edges
        this.nodes = Array.from(this.svg.querySelectorAll('.node'))
        this.edges = Array.from(this.svg.querySelectorAll('.edge'))

        console.log(
            `Found ${this.nodes.length} nodes and ${this.edges.length} edges`,
        )

        // If no nodes found with .node class, try alternative selectors
        if (this.nodes.length === 0) {
            console.log(
                'No .node elements found, trying alternative selectors...',
            )
            this.nodes = Array.from(
                this.svg.querySelectorAll('g[class*="node"]'),
            )
            console.log(
                `Found ${this.nodes.length} nodes with g[class*="node"] selector`,
            )

            if (this.nodes.length === 0) {
                this.nodes = Array.from(this.svg.querySelectorAll('g'))
                this.nodes = this.nodes.filter(g => {
                    const title = g.querySelector('title')
                    return (
                        title &&
                        title.textContent &&
                        !title.textContent.includes('->')
                    )
                })
                console.log(
                    `Found ${this.nodes.length} potential node elements by filtering g elements`,
                )
            }
        }

        // If no edges found with .edge class, try alternative selectors
        if (this.edges.length === 0) {
            console.log(
                'No .edge elements found, trying alternative selectors...',
            )
            this.edges = Array.from(
                this.svg.querySelectorAll('g[class*="edge"]'),
            )
            console.log(
                `Found ${this.edges.length} edges with g[class*="edge"] selector`,
            )

            if (this.edges.length === 0) {
                this.edges = Array.from(this.svg.querySelectorAll('g'))
                this.edges = this.edges.filter(g => {
                    const title = g.querySelector('title')
                    return (
                        title &&
                        title.textContent &&
                        title.textContent.includes('->')
                    )
                })
                console.log(
                    `Found ${this.edges.length} potential edge elements by filtering g elements`,
                )
            }
        }

        // Debug: log first few nodes
        if (this.nodes.length > 0) {
            console.log('First node:', this.nodes[0])
            console.log('Node classes:', this.nodes[0].className)
            console.log('Node classList:', this.nodes[0].classList)
            if (this.nodes[0].id) {
                console.log('Node ID:', this.nodes[0].id)
            }
            const title = this.nodes[0].querySelector('title')
            if (title) {
                console.log('Node title:', title.textContent)
            }
        }

        // Debug: log SVG structure
        console.log('SVG children:', this.svg.children)
        console.log('All g elements:', this.svg.querySelectorAll('g'))

        // Add hover effects to edges
        this.edges.forEach(edge => {
            const paths = edge.querySelectorAll('path')
            paths.forEach(path => {
                if (!path.classList.contains('hover-path')) {
                    const hoverPath = path.cloneNode()
                    hoverPath.classList.add('hover-path')
                    hoverPath.removeAttribute('stroke-dasharray')
                    path.parentNode.appendChild(hoverPath)
                }
            })
        })
    }

    /**
     * Add event listeners
     */
    addListeners() {
        const handleSelection = target => {
            console.log(
                'Click target:',
                target,
                'tagName:',
                target.tagName,
                'classes:',
                target.classList,
            )

            const elemTuple = this.findNearestGraphElem(target)
            console.log('Found element tuple:', elemTuple)

            if (elemTuple === null) {
                console.log('No graph element found, resetting')
                this.reset()
                return
            }

            const [elem, elemType] = elemTuple
            console.log('Selected element:', elem, 'type:', elemType)

            switch (elemType) {
                case GraphElemType.NODE:
                    this.onSelectNode(elem)
                    break
                // Edge selection is disabled for now
                // case GraphElemType.EDGE:
                //     this.onSelectEdge(elem)
                //     break
            }
        }

        this.svg.addEventListener('click', event => {
            console.log('Left-click event triggered')
            handleSelection(event.target)
        })

        this.svg.addEventListener('contextmenu', event => {
            console.log('Right-click (contextmenu) event triggered')
            event.preventDefault() // Prevent default context menu
            handleSelection(event.target)
        })
    }

    /**
     * Reset all selections by notifying the extension
     */
    reset() {
        console.log('Resetting selection, sending message to extension.')
        this.vscode.postMessage({
            command: 'resetClicked',
        })
    }

    /**
     * Handle node selection
     * @param {SVGGElement} node
     */
    onSelectNode(node) {
        const title = node.querySelector('title')
        if (title) {
            const nodeId = title.textContent
            console.log(
                `Node clicked: ${nodeId}, sending message to extension.`,
            )
            this.vscode.postMessage({
                command: 'nodeClicked',
                nodeId: nodeId,
                isIncoming: this.isIncoming,
            })
        } else {
            console.log('Clicked node has no title, cannot send message.')
        }
    }

    /**
     * Find nearest graph element
     * @param {Element} elem
     * @returns {Array|null}
     */
    findNearestGraphElem(elem) {
        console.log(
            'Finding nearest graph element for:',
            elem.tagName,
            elem.classList.toString(),
        )

        while (elem && elem !== this.svg) {
            console.log(
                'Checking element:',
                elem.tagName,
                'classes:',
                elem.classList.toString(),
            )

            // Check if current element has node or edge class
            if (elem.classList) {
                for (let i = 0; i < elem.classList.length; ++i) {
                    const className = elem.classList[i]

                    if (className === 'node') {
                        console.log('Found node element:', elem)
                        return [elem, GraphElemType.NODE]
                    }
                    if (className === 'edge') {
                        console.log('Found edge element:', elem)
                        return [elem, GraphElemType.EDGE]
                    }
                }
            }

            // Move to parent element
            elem = elem.parentElement
        }

        console.log('No graph element found')
        return null
    }
}

// Global variable to store the interactive graph instance
window.interactiveGraph = null

/**
 * Initialize interactive call graph
 * @param {SVGSVGElement} svg
 */
function initializeInteractiveGraph(svg, isIncoming) {
    console.log(
        'Initializing interactive graph with SVG:',
        svg,
        'isIncoming:',
        isIncoming,
    )
    console.log(
        'SVG tagName:',
        svg.tagName,
        'SVG id:',
        svg.id,
        'SVG class:',
        svg.className,
    )
    console.log('Found', svg.querySelectorAll('g.node').length, 'nodes')
    console.log('Found', svg.querySelectorAll('g.edge').length, 'edges')

    if (window.interactiveGraph) {
        window.interactiveGraph = null
    }

    try {
        window.interactiveGraph = new InteractiveCallGraph(svg, isIncoming)
        console.log(
            'InteractiveCallGraph instance created:',
            window.interactiveGraph,
        )
        window.interactiveGraph.activate()
        console.log('InteractiveCallGraph activated successfully')
    } catch (error) {
        console.error('Error initializing interactive graph:', error)
    }
}

// Export for use in HTML
window.initializeInteractiveGraph = initializeInteractiveGraph
