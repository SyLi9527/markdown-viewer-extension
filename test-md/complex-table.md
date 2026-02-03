# 复杂表格测试

下面是 **HTML 表格**（包含多表格 + 复杂样式）：

<table style="border:2px solid #222;border-collapse:collapse;width:100%;">
  <thead>
    <tr>
      <th style="text-align:center;background:#f0f0f0;border:2px solid #222;">主表头</th>
      <th style="text-align:center;background:#f0f0f0;border:2px solid #222;">信息</th>
      <th style="text-align:center;background:#f0f0f0;border:2px solid #222;">备注</th>
      <th style="text-align:center;background:#f0f0f0;border:2px solid #222;">状态</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td rowspan="2" style="vertical-align:middle;border:1px solid #999;background:#fffbe6;">
        <strong>合并行</strong><br>
        <em>rowspan=2</em>
      </td>
      <td style="color:#c00;border:1px solid #999;">红色文字</td>
      <td style="text-align:right;border:1px solid #999;">右对齐</td>
      <td style="text-align:center;border:1px solid #999;background:#e8f5e9;">
        <strong>OK</strong>
      </td>
    </tr>
    <tr>
      <td colspan="2" style="text-align:center;background:#ffeeba;border:1px solid #999;">
        <em>colspan=2</em>，含 <strong>加粗</strong>、<del>删除</del>、
        <sup>上标</sup>、<sub>下标</sub>、<code>code</code>
      </td>
      <td style="text-align:center;border:1px solid #999;">
        <em>Pending</em>
      </td>
    </tr>
    <tr>
      <td style="background:#e3f2fd;border:1px solid #999;">浅蓝背景</td>
      <td style="vertical-align:bottom;border:1px solid #999;">下对齐</td>
      <td style="border:1px solid #999;">
        链接：<a href="https://example.com">example.com</a><br>
        换行测试
      </td>
      <td style="border:1px solid #999;text-align:center;">
        <strong><em>Mixed</em></strong>
      </td>
    </tr>
    <tr>
      <td style="border:1px solid #999;background:#fce4ec;">粉色</td>
      <td style="border:1px solid #999;text-align:left;">
        左对齐 + <s>删除线</s>
      </td>
      <td style="border:1px solid #999;text-align:justify;">
        两端对齐示例文字，用于测试长文本布局。
      </td>
      <td style="border:1px solid #999;text-align:center;color:#0066cc;">
        颜色 + 居中
      </td>
    </tr>
  </tbody>
</table>

<br>

<table style="border:1px solid #444;border-collapse:collapse;width:100%;">
  <tr>
    <th style="background:#ddeeff;border:1px solid #444;">第二个表</th>
    <th style="background:#ddeeff;border:1px solid #444;">描述</th>
    <th style="background:#ddeeff;border:1px solid #444;">状态</th>
  </tr>
  <tr>
    <td style="border:1px solid #444;">A1</td>
    <td style="border:1px solid #444;">
      <strong>粗体</strong> + <em>斜体</em> + <code>code</code>
    </td>
    <td style="border:1px solid #444;text-align:center;color:#2e7d32;">
      ✅ 通过
    </td>
  </tr>
  <tr>
    <td style="border:1px solid #444;">A2</td>
    <td style="border:1px solid #444;">
      多行<br>文本<br>测试
    </td>
    <td style="border:1px solid #444;text-align:center;color:#f57c00;">
      ⏳ 处理中
    </td>
  </tr>
  <tr>
    <td style="border:1px solid #444;">A3</td>
    <td style="border:1px solid #444;">
      含 <sup>上标</sup> 和 <sub>下标</sub>
    </td>
    <td style="border:1px solid #444;text-align:center;color:#c62828;">
      ❌ 失败
    </td>
  </tr>
</table>

---

下面是 **标准 Markdown 表格**（用于对比）：

| 项目 | 描述 | 状态 |
| --- | --- | --- |
| M1 | **粗体** + *斜体* | ✅ |
| M2 | `code` + ~~删除线~~ | ⏳ |
| M3 | 普通文本 | ❌ |