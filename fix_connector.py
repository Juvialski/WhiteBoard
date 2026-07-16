import re

with open('src/components/WhiteboardCanvas.tsx', 'r') as f:
    content = f.read()

# 1. Remove tempConnector state
content = re.sub(r'  // Dynamic temporary connector line state\n  const \[tempConnector, setTempConnector\].*?;\n\n', '', content)

# 2. Remove "|| targetElement.type === 'connector'" in several places
content = content.replace(" || targetElement.type === 'connector'", "")
content = content.replace(" && el.type !== 'connector'", "")
content = content.replace(" || el.type === 'connector'", "")

# 3. Remove tool connector creation (lines 398-422 roughly)
content = re.sub(r'    // 3\. Connectors placement\n    if \(activeTool === \'connector\'\) \{.*?    \}\n\n', '', content, flags=re.DOTALL)

# 4. Remove drawing temp connector line
content = re.sub(r'    // 3\. Drawing temporary connector line\n    if \(tempConnector\) \{.*?    \}\n\n', '', content, flags=re.DOTALL)

# 5. Remove connectors creation on mouse up
content = re.sub(r'    // 3\. Connectors creation on mouse up\n    if \(tempConnector.*?\}\n\n      setTempConnector\(null\);\n      setActiveTool\(\'select\'\);\n', '', content, flags=re.DOTALL)

# 6. Remove el.type === 'connector' in select element block
content = re.sub(r'        \} else if \(el\.type === \'connector\'\) \{[\s\S]*?        \}', '', content)

# 7. Remove key === 'l'
content = content.replace("        else if (key === 'l') setActiveTool('connector');\n", "")

# 8. Remove duplicate offset for connector
content = re.sub(r'          \} else if \(el\.type === \'connector\'\) \{.*?          \}', '', content, flags=re.DOTALL)

# 9. Remove connector rendering
content = re.sub(r'            \{\/\* Draw active/temp connector line \*\/\}.*?          <\/svg>', '          </svg>', content, flags=re.DOTALL)

# 10. Remove Connector Guide Tip
content = re.sub(r'      \{\/\* Connector Tool active guide tip \*\/\}\n      \{activeTool === \'connector\' && \([\s\S]*?      \}\)\n', '', content)

# 11. Remove { key: 'L', label: 'Connector Line', tool: 'connector' },
content = content.replace("                { key: 'L', label: 'Connector Line', tool: 'connector' },\n", "")

with open('src/components/WhiteboardCanvas.tsx', 'w') as f:
    f.write(content)
