import esbuild from 'esbuild'
import process from 'process'
import console from 'console'

const production = process.argv.includes('--production')
const watch = process.argv.includes('--watch')



/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
    name: 'esbuild-problem-matcher',

    setup(build) {
        build.onStart(() => {
            console.log('[watch] build started')
        })
        build.onEnd(result => {
            result.errors.forEach(({ text, location }) => {
                console.error(`✘ [ERROR] ${text}`)
                console.error(
                    `    ${location.file}:${location.line}:${location.column}:`,
                )
            })
            console.log('[watch] build finished')
        })
    },
}

const extensionConfig = {
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    outfile: 'out/extension.js',
    external: ['vscode'],
    logLevel: 'silent',
    plugins: [esbuildProblemMatcherPlugin],
};

const testConfig = {
    entryPoints: ['test/runTest.ts', 'test/suite/index.ts', 'test/suite/dot.test.ts', 'test/suite/mermaid.test.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    outdir: 'out/test',
    external: ['vscode', 'mocha', 'glob'],
    logLevel: 'silent',
    plugins: [esbuildProblemMatcherPlugin],
};

async function main() {
    const extensionCtx = await esbuild.context(extensionConfig);
    const testCtx = await esbuild.context(testConfig);

    if (watch) {
        await extensionCtx.watch();
        await testCtx.watch();
    } else {
        await extensionCtx.rebuild();
        await testCtx.rebuild();
        await extensionCtx.dispose();
        await testCtx.dispose();
    }
}

main().catch(e => {
    console.error(e)
    process.exit(1)
})
