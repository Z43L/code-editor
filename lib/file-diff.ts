// File diff and modification utilities
export interface DiffLine {
  type: 'added' | 'removed' | 'unchanged' | 'modified';
  lineNumber: number;
  content: string;
  originalLineNumber?: number;
}

export interface FileDiff {
  additions: DiffLine[];
  deletions: DiffLine[];
  modifications: DiffLine[];
  unchanged: DiffLine[];
}

export interface FileModification {
  filePath: string;
  originalContent: string;
  modifiedContent: string;
  diff: FileDiff;
  tempFilePath?: string;
}

class FileDiffService {
  // Create a simple line-by-line diff
  createDiff(originalContent: string, modifiedContent: string): FileDiff {
    const originalLines = originalContent.split('\n');
    const modifiedLines = modifiedContent.split('\n');
    
    const diff: FileDiff = {
      additions: [],
      deletions: [],
      modifications: [],
      unchanged: []
    };

    // Simple diff algorithm - can be enhanced with more sophisticated algorithms like Myers
    const maxLength = Math.max(originalLines.length, modifiedLines.length);
    
    for (let i = 0; i < maxLength; i++) {
      const originalLine = originalLines[i];
      const modifiedLine = modifiedLines[i];
      
      if (originalLine === undefined && modifiedLine !== undefined) {
        // Line added
        diff.additions.push({
          type: 'added',
          lineNumber: i + 1,
          content: modifiedLine
        });
      } else if (originalLine !== undefined && modifiedLine === undefined) {
        // Line deleted
        diff.deletions.push({
          type: 'removed',
          lineNumber: i + 1,
          content: originalLine,
          originalLineNumber: i + 1
        });
      } else if (originalLine !== modifiedLine) {
        // Line modified
        diff.modifications.push({
          type: 'modified',
          lineNumber: i + 1,
          content: modifiedLine,
          originalLineNumber: i + 1
        });
      } else {
        // Line unchanged
        diff.unchanged.push({
          type: 'unchanged',
          lineNumber: i + 1,
          content: originalLine || '',
          originalLineNumber: i + 1
        });
      }
    }

    return diff;
  }

  // Apply diff to original content
  applyDiff(originalContent: string, diff: FileDiff): string {
    const originalLines = originalContent.split('\n');
    const result: string[] = [];
    
    // Create a map of line numbers to modifications
    const modifications = new Map<number, string>();
    const deletions = new Set<number>();
    
    diff.modifications.forEach(mod => {
      if (mod.originalLineNumber) {
        modifications.set(mod.originalLineNumber, mod.content);
      }
    });
    
    diff.deletions.forEach(del => {
      if (del.originalLineNumber) {
        deletions.add(del.originalLineNumber);
      }
    });

    // Process original lines
    for (let i = 0; i < originalLines.length; i++) {
      const lineNumber = i + 1;
      
      if (deletions.has(lineNumber)) {
        // Skip deleted lines
        continue;
      }
      
      if (modifications.has(lineNumber)) {
        // Use modified content
        result.push(modifications.get(lineNumber)!);
      } else {
        // Keep original line
        result.push(originalLines[i]);
      }
    }

    // Add new lines
    diff.additions.forEach(addition => {
      // For simplicity, add at the end. In a real implementation,
      // you'd need to track insertion positions
      result.push(addition.content);
    });

    return result.join('\n');
  }

  // Create a temporary file with modifications
  createTempFile(originalContent: string, modifiedContent: string, filePath: string): FileModification {
    const diff = this.createDiff(originalContent, modifiedContent);
    const tempFilePath = this.generateTempFilePath(filePath);
    
    return {
      filePath,
      originalContent,
      modifiedContent,
      diff,
      tempFilePath
    };
  }

  // Generate temporary file path
  private generateTempFilePath(originalPath: string): string {
    const timestamp = Date.now();
    const pathParts = originalPath.split('.');
    
    if (pathParts.length > 1) {
      const extension = pathParts.pop();
      const baseName = pathParts.join('.');
      return `${baseName}.temp.${timestamp}.${extension}`;
    } else {
      return `${originalPath}.temp.${timestamp}`;
    }
  }

  // Smart code replacement - tries to find the best place to insert code
  smartCodeReplacement(originalContent: string, selectedText: string, newCode: string): string {
    if (!selectedText.trim()) {
      // No selection, append at the end
      return originalContent + '\n' + newCode;
    }

    // Find the selected text in the original content
    const selectedIndex = originalContent.indexOf(selectedText);
    
    if (selectedIndex === -1) {
      // Selected text not found, append at the end
      return originalContent + '\n' + newCode;
    }

    // Replace the selected text with new code
    const beforeSelection = originalContent.substring(0, selectedIndex);
    const afterSelection = originalContent.substring(selectedIndex + selectedText.length);
    
    return beforeSelection + newCode + afterSelection;
  }

  // Extract function/class/method context around selected text
  extractContext(content: string, selectedText: string, contextLines: number = 5): {
    context: string;
    startLine: number;
    endLine: number;
  } {
    const lines = content.split('\n');
    const selectedIndex = content.indexOf(selectedText);
    
    if (selectedIndex === -1) {
      return { context: selectedText, startLine: 0, endLine: 0 };
    }

    // Find line numbers for the selected text
    const beforeSelected = content.substring(0, selectedIndex);
    const startLine = beforeSelected.split('\n').length - 1;
    const selectedLines = selectedText.split('\n').length;
    const endLine = startLine + selectedLines - 1;

    // Extract context around the selection
    const contextStart = Math.max(0, startLine - contextLines);
    const contextEnd = Math.min(lines.length - 1, endLine + contextLines);
    
    const contextLines_array = lines.slice(contextStart, contextEnd + 1);
    
    return {
      context: contextLines_array.join('\n'),
      startLine: contextStart,
      endLine: contextEnd
    };
  }

  // Format diff for display
  formatDiffForDisplay(diff: FileDiff): string {
    let result = '';
    
    if (diff.deletions.length > 0) {
      result += '--- Deletions ---\n';
      diff.deletions.forEach(line => {
        result += `- ${line.content}\n`;
      });
      result += '\n';
    }
    
    if (diff.additions.length > 0) {
      result += '+++ Additions +++\n';
      diff.additions.forEach(line => {
        result += `+ ${line.content}\n`;
      });
      result += '\n';
    }
    
    if (diff.modifications.length > 0) {
      result += '~~~ Modifications ~~~\n';
      diff.modifications.forEach(line => {
        result += `~ ${line.content}\n`;
      });
    }
    
    return result;
  }

  // Validate that the modification is safe to apply
  validateModification(modification: FileModification): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if the file has been modified since the original content was captured
    // This would require additional file system integration

    // Check for syntax validity (basic check)
    if (modification.filePath.endsWith('.json')) {
      try {
        JSON.parse(modification.modifiedContent);
      } catch (e) {
        errors.push('Invalid JSON syntax in modified content');
      }
    }

    // Check for large changes
    const originalLines = modification.originalContent.split('\n').length;
    const modifiedLines = modification.modifiedContent.split('\n').length;
    const changeRatio = Math.abs(modifiedLines - originalLines) / originalLines;
    
    if (changeRatio > 0.5) {
      warnings.push('Large change detected - more than 50% of lines modified');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
}

// Export singleton instance
export const fileDiffService = new FileDiffService();
export default fileDiffService;