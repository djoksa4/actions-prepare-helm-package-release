import { getInput, setFailed } from "@actions/core";
import { execSync } from "child_process";
import * as fs from 'fs';
import * as path from 'path';
import { run } from "../index";

jest.mock("@actions/core");
jest.mock("child_process");
jest.mock("fs");

describe("Helm Package Release Action", () => {
    const sourceDir = "/mocked/source";
    const destinationDir = "/mocked/destination";
    const auxDir = path.join(sourceDir, "aux_dir");
    const destinationHelmDir = path.join(destinationDir, "helm");

    beforeEach(() => {
        // Mock inputs
        (getInput as jest.Mock).mockImplementation((name: string) => {
            if (name === "source-dir") return sourceDir;
            if (name === "destination-dir") return destinationDir;
            if (name === "destination-branch") return "main";
            return "";
        });

        // Mock file system calls
        (fs.existsSync as jest.Mock).mockReturnValue(false);
        (fs.mkdirSync as jest.Mock).mockImplementation(() => {});
        (fs.readdirSync as jest.Mock).mockImplementation(() => ["test-file.tgz"]);
        (fs.copyFileSync as jest.Mock).mockImplementation(() => {});
        (fs.renameSync as jest.Mock).mockImplementation(() => {});
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    test("should create aux_dir if it doesn't exist", async () => {
        await run();
        expect(fs.mkdirSync).toHaveBeenCalledWith(auxDir, { recursive: true });
    });

    test("should move modified files to aux_dir", async () => {
        await run();
        expect(fs.renameSync).toHaveBeenCalledWith(
            path.join(sourceDir, "app/test-file.tgz"),
            path.join(auxDir, "test-file.tgz")
        );
    });

    test("should create helm directory in destination if it doesn't exist", async () => {
        await run();
        expect(fs.mkdirSync).toHaveBeenCalledWith(destinationHelmDir, { recursive: true });
    });

    test("should generate Helm index.yaml if .tgz files are present", async () => {
        (execSync as jest.Mock).mockImplementation(() => ""); // Mock helm command
        await run();
        expect(execSync).toHaveBeenCalledWith(
            expect.stringContaining("helm repo index"),
            expect.objectContaining({ stdio: "inherit" })
        );
    });

    test("should copy index.yaml and .tgz files to destination", async () => {
        (fs.readdirSync as jest.Mock).mockReturnValue(["test-file.tgz", "index.yaml"]);

        await run();

        // Verify .tgz copied to destination helm directory
        expect(fs.copyFileSync).toHaveBeenCalledWith(
            path.join(auxDir, "test-file.tgz"),
            path.join(destinationHelmDir, "test-file.tgz")
        );

        // Verify index.yaml copied to destination root
        expect(fs.copyFileSync).toHaveBeenCalledWith(
            path.join(auxDir, "index.yaml"),
            path.join(destinationDir, "index.yaml")
        );
    });

    test("should skip Helm index.yaml generation if no .tgz files", async () => {
        (fs.readdirSync as jest.Mock).mockReturnValue([]); // No .tgz files
        await run();
        expect(execSync).not.toHaveBeenCalledWith(expect.stringContaining("helm repo index"));
    });
});
