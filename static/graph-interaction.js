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
     */
    constructor(svg) {
        this.svg = svg
        this.edges = null
        this.nodes = null
        this.selectedNode = null
    }

    /**
     * Initialize interactive functionality
     */
    activate() {
        // Wait for SVG to be rendered
        setTimeout(() => {
            this.initializeElements()
            this.addListeners()
            console.log('Interactive call graph activated')
        }, 100)
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
                case GraphElemType.EDGE:
                    this.onSelectEdge(elem)
                    break
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
     * Reset all selections
     */
    reset() {
        this.selectedNode = null

        if (this.nodes) {
            this.nodes.forEach(node => {
                node.classList.remove('selected')
            })
        }

        if (this.edges) {
            this.edges.forEach(edge => {
                edge.classList.remove(
                    'fade',
                    'incoming',
                    'outgoing',
                    'selected',
                    'highlighted',
                )
            })
        }
    }

    /**
     * Handle node selection
     * @param {SVGGElement} node
     */
    onSelectNode(node) {
        this.reset()

        // Get node ID from various possible sources
        let nodeId = node.id
        if (!nodeId) {
            const title = node.querySelector('title')
            if (title) {
                nodeId = title.textContent
            }
        }

        this.selectedNode = node

        console.log('Selected node:', nodeId, node)

        // Highlight selected node
        node.classList.add('selected')

        // Also add node class if it doesn't exist
        if (!node.classList.contains('node')) {
            node.classList.add('node')
        }

        console.log('Node classes after selection:', node.classList)

        // Process edges
        this.edges.forEach(edge => {
            let isRelated = false

            // Check if edge is connected to this node
            const edgeTitle = edge.querySelector('title')
            if (edgeTitle && nodeId) {
                const titleText = edgeTitle.textContent
                console.log(
                    'Checking edge:',
                    titleText,
                    'against node:',
                    nodeId,
                )

                // Parse edge connection (format: "nodeA->nodeB" or "nodeA -- nodeB")
                if (titleText.includes(nodeId)) {
                    if (titleText.startsWith(nodeId)) {
                        edge.classList.add('outgoing', 'highlighted')
                        isRelated = true
                        console.log('Found outgoing edge:', titleText)
                    } else if (titleText.endsWith(nodeId)) {
                        edge.classList.add('incoming', 'highlighted')
                        isRelated = true
                        console.log('Found incoming edge:', titleText)
                    }
                }
            }

            // Fade unrelated edges
            if (!isRelated) {
                edge.classList.add('fade')
            }
        })

        // Update info panel
        const infoPanel = document.getElementById('infoPanel')
        const infoPanelContent = document.getElementById('infoPanelContent')
        if (infoPanel && infoPanelContent && nodeId) {
            infoPanelContent.textContent = `Selected: ${nodeId}`
            infoPanel.classList.add('show')
        }
    }

    /**
     * Handle edge selection
     * @param {SVGGElement} edge
     */
    onSelectEdge(edge) {
        this.reset()

        console.log('Selected edge:', edge.id)

        edge.classList.add('selected', 'highlighted')

        // Fade other edges
        this.edges.forEach(e => {
            if (e !== edge) {
                e.classList.add('fade')
            }
        })
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
function initializeInteractiveGraph(svg) {
    console.log('Initializing interactive graph with SVG:', svg)
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
        window.interactiveGraph = new InteractiveCallGraph(svg)
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
