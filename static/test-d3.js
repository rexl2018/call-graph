// 测试脚本，用于验证d3和d3-graphviz库是否正确加载
console.log('Testing d3 and d3-graphviz loading...')

// 检查d3是否加载
if (typeof d3 !== 'undefined') {
    console.log('d3 loaded successfully:', d3.version)
} else {
    console.error('d3 failed to load')
}

// 检查d3-graphviz是否加载
if (typeof d3.graphviz === 'function') {
    console.log('d3-graphviz loaded successfully')
} else {
    console.error('d3-graphviz failed to load')
}

// 检查@hpcc-js/wasm是否加载
if (typeof window.graphviz !== 'undefined') {
    console.log('@hpcc-js/wasm loaded successfully')
} else {
    console.error('@hpcc-js/wasm failed to load')
}
