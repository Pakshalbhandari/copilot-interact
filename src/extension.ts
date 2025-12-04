import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

// Interface for prompt chain configuration
interface PromptChain {
    name: string;
    prompts: string[];
    description?: string;
}

export function activate(context: vscode.ExtensionContext) {
    console.log('Copilot Interact is now active');

    // Register the single prompt command
    let singlePromptDisposable = vscode.commands.registerCommand(
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

    // Register the sequential chain command
    let sequentialChainDisposable = vscode.commands.registerCommand(
        'copilot-interact.invokeSequential',
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

                // Step 2: Look for chain configuration files
                const chainFiles = await getChainFiles(fullPromptsPath);
                
                let selectedChain: PromptChain | undefined;
                
                if (chainFiles.length > 0) {
                    // Define the type for chain choices
                    type ChainChoice = {
                        label: string;
                        description: string;
                        isCustom: true;
                    } | {
                        label: string;
                        description: string;
                        detail: string;
                        chain: PromptChain;
                        isCustom: false;
                    };

                    // Let user select a predefined chain or create custom
                    const choices: (ChainChoice | { label: string; kind: vscode.QuickPickItemKind })[] = [
                        { 
                            label: '$(add) Create Custom Chain', 
                            description: 'Select prompts manually', 
                            isCustom: true 
                        },
                        { label: '', kind: vscode.QuickPickItemKind.Separator },
                        ...chainFiles.map(f => ({
                            label: `$(list-ordered) ${f.name}`,
                            description: f.description || 'Prompt chain',
                            detail: `${f.prompts.length} steps`,
                            chain: f,
                            isCustom: false as const
                        }))
                    ];

                    const chainChoice = await vscode.window.showQuickPick(choices, {
                        placeHolder: 'Select a prompt chain or create custom'
                    });

                    if (!chainChoice) {
                        return; // User cancelled
                    }
                    
                    if ('isCustom' in chainChoice && !chainChoice.isCustom) {
                        selectedChain = chainChoice.chain;
                    }
                } else {
                    // No predefined chains, go straight to custom
                    const shouldContinue = await vscode.window.showInformationMessage(
                        'No predefined chains found. Create a custom chain?',
                        'Yes', 'Cancel'
                    );
                    if (shouldContinue !== 'Yes') {
                        return;
                    }
                }

                // Step 3: If no chain selected, create custom chain
                if (!selectedChain) {
                    selectedChain = await createCustomChain(fullPromptsPath);
                    if (!selectedChain) {
                        return; // User cancelled
                    }
                }

                // Step 4: Get the active editor and selected text
                const editor = vscode.window.activeTextEditor;
                if (!editor) {
                    vscode.window.showErrorMessage('No active editor');
                    return;
                }

                const selection = editor.selection;
                const selectedText = editor.document.getText(selection);

                // Step 5: Execute the chain
                await executeChain(selectedChain, fullPromptsPath, selectedText);

            } catch (error) {
                vscode.window.showErrorMessage(
                    `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
                );
            }
        }
    );

    context.subscriptions.push(singlePromptDisposable, sequentialChainDisposable);
}

// Create a custom chain by letting user select multiple prompts
async function createCustomChain(promptsPath: string): Promise<PromptChain | undefined> {
    const promptFiles = await getPromptFiles(promptsPath);
    
    if (promptFiles.length === 0) {
        vscode.window.showErrorMessage('No prompt files found');
        return undefined;
    }

    const selectedPrompts: string[] = [];
    
    while (true) {
        const choices: any[] = [];
        
        // Add "Done" option at the top if prompts are selected
        if (selectedPrompts.length > 0) {
            choices.push({
                label: `$(check) Done - Execute ${selectedPrompts.length} prompts`,
                description: 'Start the chain',
                isDone: true
            });
            choices.push({ label: '', kind: vscode.QuickPickItemKind.Separator });
        }
        
        // Add separator showing selected prompts
        if (selectedPrompts.length > 0) {
            choices.push({ 
                label: `Selected prompts (in order):`, 
                kind: vscode.QuickPickItemKind.Separator 
            });
            
            selectedPrompts.forEach((p, i) => {
                choices.push({
                    label: `  ${i + 1}. ${path.basename(p, '.md')}`,
                    description: '(already selected)',
                    kind: vscode.QuickPickItemKind.Separator
                });
            });
            
            choices.push({ label: '', kind: vscode.QuickPickItemKind.Separator });
            choices.push({ 
                label: 'Available prompts:', 
                kind: vscode.QuickPickItemKind.Separator 
            });
        }
        
        // Add available prompt files
        promptFiles
            .filter(f => !selectedPrompts.includes(f))
            .forEach(f => {
                choices.push({
                    label: path.basename(f, '.md'),
                    description: selectedPrompts.length > 0 ? `Will be step ${selectedPrompts.length + 1}` : 'First step',
                    filePath: f,
                    isDone: false
                });
            });

        const selected = await vscode.window.showQuickPick(choices, {
            placeHolder: selectedPrompts.length === 0 
                ? 'Select first prompt for the chain' 
                : `Select next prompt (${selectedPrompts.length} selected)`
        });

        if (!selected) {
            return undefined; // User cancelled
        }
        
        if ('isDone' in selected && selected.isDone) {
            break; // User finished selecting
        }

        if ('filePath' in selected) {
            selectedPrompts.push(selected.filePath);
        }
    }

    return {
        name: 'Custom Chain',
        prompts: selectedPrompts
    };
}

// Execute a chain of prompts
async function executeChain(chain: PromptChain, promptsPath: string, initialCode: string) {
    vscode.window.showInformationMessage(
        `Starting chain: ${chain.name} (${chain.prompts.length} steps)`
    );

    // Build the complete sequential prompt
    let conversationPrompt = '';
    
    // Add initial code context
    if (initialCode) {
        conversationPrompt += `Here is the code to analyze:\n\n\`\`\`\n${initialCode}\n\`\`\`\n\n`;
    }

    conversationPrompt += `I need you to perform the following analysis steps in sequence. `;
    conversationPrompt += `After each step, use the insights from previous steps to inform the next one.\n\n`;

    // Load and add each prompt
    for (let i = 0; i < chain.prompts.length; i++) {
        const promptFile = chain.prompts[i];
        const promptContent = await fs.promises.readFile(
            path.join(promptsPath, promptFile),
            'utf-8'
        );

        conversationPrompt += `**Step ${i + 1}: ${path.basename(promptFile, '.md')}**\n`;
        conversationPrompt += `${promptContent}\n\n`;
    }

    conversationPrompt += `\nPlease execute each step in order, clearly labeling each step and building on previous insights.`;

    // Send to Copilot
    await invokeCopilotChat(conversationPrompt);
}

// Get chain configuration files (.chain.json)
async function getChainFiles(promptsPath: string): Promise<PromptChain[]> {
    try {
        const files = await fs.promises.readdir(promptsPath);
        const chainFiles = files.filter(f => f.endsWith('.chain.json'));
        
        const chains: PromptChain[] = [];
        for (const file of chainFiles) {
            try {
                const content = await fs.promises.readFile(
                    path.join(promptsPath, file),
                    'utf-8'
                );
                const chain = JSON.parse(content) as PromptChain;
                chains.push(chain);
            } catch (error) {
                console.error(`Error reading chain file ${file}:`, error);
            }
        }
        
        return chains;
    } catch (error) {
        return [];
    }
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

    } catch (error) {
        vscode.window.showWarningMessage(
            'Could not open Copilot Chat. Make sure GitHub Copilot extension is installed.'
        );
        
        await vscode.env.clipboard.writeText(prompt);
        vscode.window.showInformationMessage(
            'Prompt copied to clipboard. Paste it into Copilot Chat manually.'
        );
    }
}

export function deactivate() {}