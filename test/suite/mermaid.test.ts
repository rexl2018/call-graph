import * as assert from 'assert'
import * as vscode from 'vscode'
import { CallHierarchyNode } from '../../src/call'
import { generateMermaid, getNodeId } from '../../src/mermaid'

describe('Mermaid Generation Test Suite', () => {
    // Helper function to create a call hierarchy item
    const createMockCallHierarchyItem = (
        name: string,
        file: string,
        line: number,
        char: number,
    ): vscode.CallHierarchyItem => {
        const uri = vscode.Uri.file(file)
        const range = new vscode.Range(
            new vscode.Position(line, char),
            new vscode.Position(line, char + name.length),
        )
        return {
            name,
            kind: vscode.SymbolKind.Function,
            uri,
            range,
            selectionRange: range,
        }
    }

    function createMockCallHierarchyNode(
        name: string,
        file: string,
        line: number,
        char: number,
    ): CallHierarchyNode {
        const item = createMockCallHierarchyItem(name, file, line, char)
        return { item, children: [] as CallHierarchyNode[] }
    }

    // Using the exported getNodeId function from mermaid.ts
    // This ensures consistency between tests and actual implementation

    it('Simple three-node graph', () => {
        const nodeA = createMockCallHierarchyNode('A', '/a.ts', 0, 0)
        const nodeB = createMockCallHierarchyNode('B', '/b.ts', 1, 1)
        const nodeC = createMockCallHierarchyNode('C', '/c.ts', 2, 2)
        nodeA.children.push(nodeB)
        nodeB.children.push(nodeC)

        const idA = getNodeId(nodeA)
        const idB = getNodeId(nodeB)
        const idC = getNodeId(nodeC)

        // Outgoing to B
        let mermaid = generateMermaid(nodeA, false, idB)
        assert.ok(
            !mermaid.includes(idC),
            'Outgoing Simple: C should not be present',
        )
        assert.ok(mermaid.includes(`${idA} --> ${idB}`), 'Outgoing: A --> B')
        assert.ok(
            !mermaid.includes(`${idB} --> ${idC}`),
            'Outgoing: B --> C should not be present',
        )

        // Incoming from B
        mermaid = generateMermaid(nodeA, true, idB)
        assert.ok(
            !mermaid.includes(idC),
            'Outgoing Simple: C should not be present',
        )
        assert.ok(mermaid.includes(`${idB} --> ${idA}`), 'Incoming: B --> A')
        assert.ok(
            !mermaid.includes(`${idB} --> ${idC}`),
            'Incoming: B --> C should not be present',
        )
    })

    it('Graph with a cycle', () => {
        const nodeA = createMockCallHierarchyNode('A', '/a.ts', 0, 0)
        const nodeB = createMockCallHierarchyNode('B', '/b.ts', 1, 1)
        nodeA.children.push(nodeB)
        nodeB.children.push(nodeA) // Cycle

        const idA = getNodeId(nodeA)
        const idB = getNodeId(nodeB)

        // Outgoing to B
        let mermaid = generateMermaid(nodeA, false, idB)
        assert.ok(
            mermaid.includes(`${idA} --> ${idB}`),
            'Outgoing Cycle: A --> B',
        )

        // Incoming from B
        mermaid = generateMermaid(nodeA, true, idB)
        assert.ok(
            mermaid.includes(`${idB} --> ${idA}`),
            'Incoming Cycle: B --> A',
        )
    })

    it('Graph with self-reference', () => {
        const nodeA = createMockCallHierarchyNode('A', '/a.ts', 0, 0)
        nodeA.children.push(nodeA) // Self-reference

        const idA = getNodeId(nodeA)

        // Outgoing to A
        let mermaid = generateMermaid(nodeA, false, idA)
        assert.ok(
            mermaid.includes(`${idA} --> ${idA}`),
            'Outgoing Self-Ref: A --> A',
        )

        // Incoming from A
        mermaid = generateMermaid(nodeA, true, idA)
        assert.ok(
            mermaid.includes(`${idA} --> ${idA}`),
            'Incoming Self-Ref: A --> A',
        )
    })

    it('Complex multi-level graph', () => {
        const nodeA = createMockCallHierarchyNode('A', '/a.ts', 0, 0)
        const nodeB = createMockCallHierarchyNode('B', '/b.ts', 1, 1)
        const nodeC = createMockCallHierarchyNode('C', '/c.ts', 2, 2)
        const nodeD = createMockCallHierarchyNode('D', '/a.ts', 3, 3)
        const nodeE = createMockCallHierarchyNode('E', '/b.ts', 4, 4)
        const nodeF = createMockCallHierarchyNode('E', '/b.ts', 5, 5)
        nodeA.children.push(nodeB, nodeD)
        nodeB.children.push(nodeC, nodeE)
        nodeD.children.push(nodeE)
        nodeE.children.push(nodeE)

        const idA = getNodeId(nodeA)
        const idB = getNodeId(nodeB)
        const idC = getNodeId(nodeC)
        const idD = getNodeId(nodeD)
        const idE = getNodeId(nodeE)
        const idF = getNodeId(nodeF)

        // Outgoing to D
        let mermaid = generateMermaid(nodeA, false, idE)
        console.log('Complex Outgoing to D:', mermaid)

        assert.ok(
            !mermaid.includes(idC) && !mermaid.includes(idF),
            'Outgoing Complex: C/F should not be present',
        )
        assert.ok(
            mermaid.includes(idA) &&
                mermaid.includes(idB) &&
                mermaid.includes(idD) &&
                mermaid.includes(idE),
            'Outgoing Complex: A/B/D/E present',
        )
        assert.ok(
            mermaid.includes(`${idA} --> ${idB}`),
            'Outgoing Complex: A --> B',
        )
        assert.ok(
            mermaid.includes(`${idA} --> ${idD}`),
            'Outgoing Complex: A --> D',
        )
        assert.ok(
            mermaid.includes(`${idB} --> ${idE}`),
            'Outgoing Complex: B --> E',
        )
        assert.ok(
            mermaid.includes(`${idD} --> ${idE}`),
            'Outgoing Complex: D --> E',
        )
        assert.ok(
            !mermaid.includes(`${idB} --> ${idC}`),
            'Outgoing Complex: B --> C should not be present',
        )
        assert.ok(
            !mermaid.includes(`${idE} --> ${idF}`),
            'Outgoing Complex: E --> F should not be present',
        )

        // Incoming from D
        mermaid = generateMermaid(nodeA, true, idE)
        console.log('Complex Incoming from D:', mermaid)
        assert.ok(
            mermaid.includes(idA) &&
                mermaid.includes(idB) &&
                mermaid.includes(idD) &&
                mermaid.includes(idE),
            'Incoming Complex: A/B/D/E present',
        )
        assert.ok(
            mermaid.includes(`${idB} --> ${idA}`),
            'Incoming Complex: B --> A',
        )
        assert.ok(
            mermaid.includes(`${idD} --> ${idA}`),
            'Incoming Complex: D --> A',
        )
        assert.ok(
            mermaid.includes(`${idE} --> ${idB}`),
            'Incoming Complex: E --> B',
        )
        assert.ok(
            mermaid.includes(`${idE} --> ${idD}`),
            'Incoming Complex: E --> D',
        )
        assert.ok(
            !mermaid.includes(`${idC} --> ${idB}`),
            'Incoming Complex: C --> B should not be present',
        )
        assert.ok(
            !mermaid.includes(`${idF} --> ${idE}`),
            'Incoming Complex: F --> E should not be present',
        )
    })

    it('Diamond shape graph', () => {
        const nodeA = createMockCallHierarchyNode('A', '/a.ts', 0, 0)
        const nodeB = createMockCallHierarchyNode('B', '/b.ts', 1, 1)
        const nodeC = createMockCallHierarchyNode('C', '/c.ts', 2, 2)
        const nodeD = createMockCallHierarchyNode('D', '/a.ts', 3, 3)
        nodeA.children.push(nodeB, nodeC)
        nodeB.children.push(nodeD)
        nodeC.children.push(nodeD)

        const idA = getNodeId(nodeA)
        const idB = getNodeId(nodeB)
        const idC = getNodeId(nodeC)
        const idD = getNodeId(nodeD)

        // Outgoing to D
        let mermaid = generateMermaid(nodeA, false, idD)
        assert.ok(
            mermaid.includes(idA) &&
                mermaid.includes(idB) &&
                mermaid.includes(idC) &&
                mermaid.includes(idD),
            'Outgoing Diamond: All nodes present',
        )
        assert.ok(
            mermaid.includes(`${idA} --> ${idB}`),
            'Outgoing Diamond: A --> B',
        )
        assert.ok(
            mermaid.includes(`${idA} --> ${idC}`),
            'Outgoing Diamond: A --> C',
        )
        assert.ok(
            mermaid.includes(`${idB} --> ${idD}`),
            'Outgoing Diamond: B --> D',
        )
        assert.ok(
            mermaid.includes(`${idC} --> ${idD}`),
            'Outgoing Diamond: C --> D',
        )

        // Incoming from D
        mermaid = generateMermaid(nodeA, true, idD)
        assert.ok(
            mermaid.includes(idA) &&
                mermaid.includes(idB) &&
                mermaid.includes(idC) &&
                mermaid.includes(idD),
            'Incoming Diamond: All nodes present',
        )
        assert.ok(
            mermaid.includes(`${idB} --> ${idA}`),
            'Incoming Diamond: B --> A',
        )
        assert.ok(
            mermaid.includes(`${idC} --> ${idA}`),
            'Incoming Diamond: C --> A',
        )
        assert.ok(
            mermaid.includes(`${idD} --> ${idB}`),
            'Incoming Diamond: D --> B',
        )
        assert.ok(
            mermaid.includes(`${idD} --> ${idC}`),
            'Incoming Diamond: D --> C',
        )
    })
})
