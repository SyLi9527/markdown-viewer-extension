# 超复杂表格测试（含嵌套表格 / thead+tbody+tfoot / 不同边框）

<table style="width:100%;border-collapse:collapse;border:3px solid #111;">
  <colgroup>
    <col style="width:20%;">
    <col style="width:35%;">
    <col style="width:45%;">
  </colgroup>
  <thead>
    <tr>
      <th style="text-align:center;background:#f5f5f5;border:3px solid #111;">分类</th>
      <th style="text-align:center;background:#f5f5f5;border:3px solid #111;">描述</th>
      <th style="text-align:center;background:#f5f5f5;border:3px solid #111;">明细</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td rowspan="2" style="vertical-align:middle;background:#fff8e1;border-left:4px solid #ff9800;border-right:1px dashed #999;border-top:2px solid #111;border-bottom:2px solid #111;">
        <strong>模块 A</strong><br>
        <em>rowspan=2</em>
      </td>
      <td style="border:1px solid #999;">
        含 <strong>加粗</strong>、<em>斜体</em>、<s>删除</s>、<code>code</code>、<sup>上标</sup>、<sub>下标</sub>
      </td>
      <td style="border:1px solid #999;">
        <strong>嵌套表格：</strong>
        <table style="width:100%;border-collapse:collapse;border:1px solid #666;">
          <tr>
            <th style="border:1px solid #666;background:#e3f2fd;">子项</th>
            <th style="border:1px solid #666;background:#e3f2fd;">值</th>
          </tr>
          <tr>
            <td style="border:1px solid #666;">A-1</td>
            <td style="border:1px solid #666;text-align:right;">100</td>
          </tr>
          <tr>
            <td style="border:1px solid #666;">A-2</td>
            <td style="border:1px solid #666;text-align:right;">200</td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td colspan="2" style="text-align:center;background:#e8f5e9;border:1px solid #999;">
        合并列 colspan=2（带 <strong>背景色</strong> + <em>居中</em>）
      </td>
    </tr>
    <tr>
      <td style="background:#fce4ec;border-top:2px dotted #c2185b;border-right:2px dotted #c2185b;border-bottom:2px dotted #c2185b;border-left:2px dotted #c2185b;">
        模块 B
      </td>
      <td style="text-align:justify;border:1px solid #999;">
        两端对齐长文本：用于测试文本换行和对齐效果，保证 Word 中显示一致。
      </td>
      <td style="border:1px solid #999;">
        链接：<a href="https://example.com">example.com</a><br>
        换行测试<br>
        <strong><em>Mixed</em></strong>
      </td>
    </tr>
  </tbody>
  <tfoot>
    <tr>
      <td colspan="3" style="text-align:right;background:#f0f0f0;border-top:3px solid #111;">
        表尾：汇总 / 备注（tfoot）
      </td>
    </tr>
  </tfoot>
</table>

---

| 对比项 | Markdown 原生表格 | 状态 |
| --- | --- | --- |
| M1 | **粗体** + *斜体* | ✅ |
| M2 | `code` + ~~删除线~~ | ⏳ |
| M3 | 普通文本 | ❌ |