export function StatusBar() {
  return (
    <div className="bg-[#007acc] text-white text-xs flex items-center justify-between px-4 py-1 h-6">
      <div className="flex items-center gap-4">
        <span>NvimTree_1 [+]</span>
        <span>16:1</span>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="bg-[#005a9e] px-2 py-0.5 rounded">NORMAL</span>
          <span>📁 main</span>
          <span>README.md</span>
        </div>

        <div className="flex items-center gap-2">
          <span>utf-8</span>
          <span>λ</span>
          <span>📝 markdown</span>
          <span className="bg-[#005a9e] px-2 py-0.5 rounded">Top</span>
          <span>1:1</span>
        </div>
      </div>
    </div>
  )
}
