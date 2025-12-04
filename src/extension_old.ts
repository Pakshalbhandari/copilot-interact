import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export function activate(context: vscode.ExtensionContext) {
    console.log('Copilot Interact is now active');

    // Register the command
    let disposable = vscode.commands.registerCommand(
        'copilot-interact.invokeWithPrompt',
        async () => {
            try {
                // Step 1: Get the prompts directory path
                const config = vscode.workspace.getConfiguration('copilotInteract');
                const promptsPath = config.get<string>('promptsPath', 'prompts');
                
                // Get workspace folder
                const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
                if (!workspaceFolder) {
                    vscode.window.showErrorMessage('No workspace folder open');
                    return;
                }

                const fullPromptsPath = path.join(workspaceFolder.uri.fsPath, promptsPath);

                // Step 2: Read available prompt files
                const promptFiles = await getPromptFiles(fullPromptsPath);
                if (promptFiles.length === 0) {
                    vscode.window.showErrorMessage(`No prompt files found in ${promptsPath}`);
                    return;
                }

                // Step 3: Let user select a prompt file
                const selectedFile = await vscode.window.showQuickPick(
                    promptFiles.map(f => ({
                        label: path.basename(f, '.md'),
                        description: f,
                        filePath: f
                    })),
                    {
                        placeHolder: 'Select a prompt template'
                    }
                );

                if (!selectedFile) {
                    return; // User cancelled
                }

                // Step 4: Read the prompt content
                const promptContent = await fs.promises.readFile(
                    path.join(fullPromptsPath, selectedFile.filePath),
                    'utf-8'
                );

                // Step 5: Get user input (optional additional context)
                const userInput = await vscode.window.showInputBox({
                    prompt: 'Enter additional context (optional)',
                    placeHolder: 'e.g., Focus on error handling'
                });

                // Step 6: Get the active editor and selected text
                const editor = vscode.window.activeTextEditor;
                if (!editor) {
                    vscode.window.showErrorMessage('No active editor');
                    return;
                }

                const selection = editor.selection;
                const selectedText = editor.document.getText(selection);

                // Step 7: Build the complete prompt
                let completePrompt = promptContent;
                if (userInput) {
                    completePrompt += `\n\nAdditional Context: ${userInput}`;
                }
                if (selectedText) {
                    completePrompt += `\n\n\`\`\`\n${selectedText}\n\`\`\``;
                }

                // Step 8: Open Copilot chat with the prompt
                await invokeCopilotChat(completePrompt);

            } catch (error) {
                vscode.window.showErrorMessage(
                    `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
                );
            }
        }
    );

    context.subscriptions.push(disposable);
}

// Helper function to get all .md files from prompts directory
async function getPromptFiles(promptsPath: string): Promise<string[]> {
    try {
        const files = await fs.promises.readdir(promptsPath);
        return files.filter(f => f.endsWith('.md'));
    } catch (error) {
        return [];
    }
}

// Function to invoke Copilot Chat
async function invokeCopilotChat(prompt: string): Promise<void> {
    try {
        // Method 1: Using the Copilot Chat API (VS Code 1.85+)
        // This opens the chat panel with your prompt
        await vscode.commands.executeCommand('workbench.action.chat.open', {
            query: prompt
        });

        // Alternative Method 2: Insert into existing chat
        // await vscode.commands.executeCommand('workbench.action.chat.open');
        // Then you'd need to use the Chat API to send the message
        
    } catch (error) {
        vscode.window.showWarningMessage(
            'Could not open Copilot Chat. Make sure GitHub Copilot extension is installed.'
        );
        
        // Fallback: Copy to clipboard
        await vscode.env.clipboard.writeText(prompt);
        vscode.window.showInformationMessage(
            'Prompt copied to clipboard. Paste it into Copilot Chat manually.'
        );
    }
}

export function deactivate() {}