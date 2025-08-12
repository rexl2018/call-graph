import * as path from 'path'
import Mocha from 'mocha'
// import { glob } from 'glob'; // 未使用的导入，注释掉

export async function run(): Promise<void> {
    // Create the mocha test
    const mocha = new Mocha({
        ui: 'tdd',
        color: true,
    })

    const testsRoot = path.resolve(__dirname, '..')

    const files = [
        path.resolve(testsRoot, 'suite/dot.test.js'),
        path.resolve(testsRoot, 'suite/mermaid.test.js'),
    ]

    // Add files to the test suite
    files.forEach(f => mocha.addFile(f))

    return new Promise((c, e) => {
        try {
            // Run the mocha test
            mocha.run((failures: number) => {
                if (failures > 0) {
                    e(new Error(`${failures} tests failed.`))
                } else {
                    c()
                }
            })
        } catch (err) {
            console.error(err)
            e(err)
        }
    })
}
