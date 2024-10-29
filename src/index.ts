import { getInput, setFailed } from "@actions/core";
import * as github from "@actions/github";
import { execSync } from "child_process";
import * as fs from 'fs';
import * as path from 'path';

async function run(): Promise<void> {

    const sourceDir: string = getInput('source-dir');
    const destinationDir: string = getInput('destination-dir');
    const destinationBranch: string = getInput('destination-branch');

    try {
        // Set the working directory to source-dir input
        process.chdir(sourceDir);

        // Get the commit SHA from GitHub context
        const commitSha: string = github.context.sha;
        // List of files modified in the app directory for the current commit (compared to the previous commit)
        // Ensures that only the files packaged in this commit are processed (outputs relative file paths of these files - array of paths)
        const fileList: string[] = execSync(`git diff-tree --no-commit-id --name-only -r ${commitSha} -- ./app`)
        .toString()
        .trim()
        .split('\n');

        // Create the aux_dir directory
        const auxDir: string = path.join(process.cwd(), 'aux_dir');
        if (!fs.existsSync('aux_dir')) {
            fs.mkdirSync('aux_dir', { recursive: true });
        }

        // Move the files from 'fileList' (that were modified in the current commit) to aux_dir directory
        fileList.forEach((file: string) => {
            console.log(`file: ${file}`);
            if (fs.existsSync(file) && fs.statSync(file).isFile()) {
                const destPath: string = path.join(auxDir, path.basename(file));
                fs.renameSync(file, destPath);
                console.log(`Moved ${file} to aux_dir`);
            } else {
                throw new Error(`Error: File '${file}' does not exist.`);
            }
        });

        // Raw content URL needed to serve files directly from GitHub repo as if they were hosted on a web server
        const url: string = `https://raw.githubusercontent.com/${github.context.repo.owner}/helm-store/${destinationBranch}/helm/`;

        // Generate / update index.yaml in aux_dir, linking each .tgz file with its raw GitHub URL
        const hasTgzFiles: boolean = fs.readdirSync(auxDir).some((file: string): boolean => file.endsWith('.tgz'));

        if (hasTgzFiles) {
            console.log("Generating/updating Helm index.yaml...");

            const mergePath: string = path.join(destinationDir, 'index.yaml');
            execSync(`helm repo index ${auxDir} --merge ${mergePath} --url ${url}`, { stdio: 'inherit' });
            console.log("index.yaml generated/updated successfully.");
        } else {
            console.warn("Warning: No .tgz files found in aux_dir. Skipping index generation.");
        }

        // Create helm directory in the dest directory if it doesnt exist already
        const helmDir: string = path.join(destinationDir, 'helm');
        if (!fs.existsSync(helmDir)) {
            fs.mkdirSync(helmDir, { recursive: true });
            console.log(`Directory ${helmDir} created.`);
        }

        // Prepare dest directory with updated .tgz packages and an updated index.yaml
        console.log("Copying files...");

        // Copy all files except index.yaml to destinationDir/helm
        fs.readdirSync(auxDir).forEach((file: string): void => {
            if (file !== 'index.yaml') {
                const srcPath: string = path.join(auxDir, file);
                const destPath: string = path.join(helmDir, file);
                fs.copyFileSync(srcPath, destPath);
                console.log(`Copied ${file} to ${helmDir}`);
            }
        });

        // Copy index.yaml to the destinationDir root
        const indexPath: string = path.join(auxDir, 'index.yaml');
        const destIndexPath: string = path.join(destinationDir, 'index.yaml');
        if (fs.existsSync(indexPath)) {
            fs.copyFileSync(indexPath, destIndexPath);
            console.log("Copied index.yaml to the destination directory.");
        } else {
            console.warn("Warning: No index.yaml file found in aux_dir.");
        }

    } catch (error) {
        setFailed((error as Error)?.message ?? "Unknown error.");
    }
}

run();