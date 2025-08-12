import * as path from 'path'
import Mocha from 'mocha'
import { glob } from 'glob'
import mock from 'mock-require'

async function main() {
    // Parse command line arguments
    const args = process.argv.slice(2)
    let testFileFilter = null

    // Check if there's a --test-file argument
    const testFileIndex = args.indexOf('--test-file')
    if (testFileIndex !== -1 && testFileIndex + 1 < args.length) {
        testFileFilter = args[testFileIndex + 1]
        console.log(`Test file filter: ${testFileFilter}`)
    }

    // Mock the 'vscode' module
    mock('vscode', {
        CallHierarchyItem: class CallHierarchyItem {
            kind: number
            name: string
            detail: string
            uri: { path: string; fsPath: string }
            range: {
                start: { line: number; character: number }
                end: { line: number; character: number }
            }
            selectionRange: {
                start: { line: number; character: number }
                end: { line: number; character: number }
            }
            constructor(
                kind: number,
                name: string,
                detail: string,
                uri: { path: string; fsPath: string },
                range: {
                    start: { line: number; character: number }
                    end: { line: number; character: number }
                },
                selectionRange: {
                    start: { line: number; character: number }
                    end: { line: number; character: number }
                },
            ) {
                this.kind = kind
                this.name = name
                this.detail = detail
                this.uri = uri
                this.range = range
                this.selectionRange = selectionRange
            }
        },
        SymbolKind: {
            File: 0,
            Module: 1,
            Namespace: 2,
            Package: 3,
            Class: 4,
            Method: 5,
            Property: 6,
            Field: 7,
            Constructor: 8,
            Enum: 9,
            Interface: 10,
            Function: 11,
            Variable: 12,
            Constant: 13,
            String: 14,
            Number: 15,
            Boolean: 16,
            Array: 17,
            Object: 18,
            Key: 19,
            Null: 20,
            EnumMember: 21,
            Struct: 22,
            Event: 23,
            Operator: 24,
            TypeParameter: 25,
        },
        Uri: {
            file: (path: string) => ({ path, fsPath: path }),
        },
        Range: class Range {
            start: { line: number; character: number }
            end: { line: number; character: number }
            constructor(
                start: { line: number; character: number },
                end: { line: number; character: number },
            ) {
                this.start = start
                this.end = end
            }
        },
        Position: class Position {
            line: number
            character: number
            constructor(line: number, character: number) {
                this.line = line
                this.character = character
            }
        },
        window: {
            createOutputChannel: (name: string) => ({
                appendLine: (value: string) =>
                    console.log(`[${name}] ${value}`),
            }),
        },
        workspace: {
            workspaceFolders: [
                {
                    uri: {
                        path: '/mock/workspace',
                        fsPath: '/mock/workspace',
                    },
                },
            ],
            getConfiguration: () => ({
                get: (section: string) => {
                    if (section === 'call-graph.ignoreFile') {
                        return null
                    }
                    return undefined
                },
            }),
        },
    })

    const mocha = new Mocha({
        ui: 'bdd',
        color: true,
    })

    const testsRoot = path.resolve(__dirname, 'suite')
    console.log(`Searching for test files in ${testsRoot}`)

    try {
        const files = await glob('**/**.test.js', { cwd: testsRoot })
        console.log('Found test files:', files)

        // Filter files if a test file filter is specified
        const filesToRun = testFileFilter
            ? files.filter(f => f.includes(testFileFilter))
            : files

        console.log('Files to run:', filesToRun)

        filesToRun.forEach((f: string) => {
            const filePath = path.resolve(testsRoot, f)
            console.log(`Adding file to mocha: ${filePath}`)
            mocha.addFile(filePath)
        })

        console.log('Running tests...')
        mocha.run((failures: number) => {
            if (failures > 0) {
                console.error(`${failures} tests failed.`)
                process.exit(1)
            } else {
                console.log('All tests passed.')
                process.exit(0)
            }
        })
    } catch (err) {
        console.error('Failed to run tests', err)
        process.exit(1)
    }
}

main()
