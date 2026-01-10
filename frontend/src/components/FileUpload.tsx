import { File, FileText, X } from "lucide-react";
import type { ChangeEvent, DragEvent } from "react";
import { useRef } from "react";

import { Button } from "@/components/Button";
import { Progress } from "@/components/ui/progress";
import { toastError } from "@/lib/utils/toast";

interface FileWithProgress extends File {
  progress?: number;
  error?: string;
}

interface FileUploadProps {
  files: FileWithProgress[];
  onFilesChange: (files: FileWithProgress[]) => void;
  uploading?: boolean;
  onUpload?: () => void;
  onCancel?: () => void;
  uploadProgress?: number;
}

const MAX_FILE_SIZE = 100 * 1024 * 1024;
const MAX_FILES = 10;

export function FileUpload({
  files,
  onFilesChange,
  uploading = false,
  onCancel,
  uploadProgress = 0,
}: FileUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (newFiles: FileList | null) => {
    if (!newFiles) return;

    const validFiles: FileWithProgress[] = [];
    const errors: string[] = [];

    Array.from(newFiles).forEach((file) => {
      if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
        errors.push(`${file.name}: Only PDF files are allowed`);
        return;
      }

      if (file.size > MAX_FILE_SIZE) {
        errors.push(`${file.name}: File size exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit`);
        return;
      }

      if (files.length + validFiles.length >= MAX_FILES) {
        errors.push(`Maximum ${MAX_FILES} files allowed`);
        return;
      }

      validFiles.push(file);
    });

    if (errors.length > 0) {
      toastError(errors.join("\n"));
    }

    if (validFiles.length > 0) {
      const updatedFiles = [...files, ...validFiles];
      onFilesChange(updatedFiles);
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    handleFile(event.target.files);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    handleFile(event.dataTransfer.files);
  };

  const removeFile = (index: number) => {
    const updatedFiles = files.filter((_, i) => i !== index);
    onFilesChange(updatedFiles);
  };

  const resetFiles = () => {
    onFilesChange([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    onCancel?.();
  };

  const getFileIcon = () => {
    return <FileText className="h-5 w-5 text-gray-900" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const currentProgress = uploading ? uploadProgress : 0;

  return (
    <div className="space-y-4">
      <div
        className="flex justify-center rounded-md border border-dashed border-gray-300 px-6 py-12 bg-gray-50"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        <div className="text-center">
          <File
            className="mx-auto h-12 w-12 text-gray-400"
            aria-hidden={true}
          />
          <div className="flex text-sm leading-6 text-gray-600 justify-center items-center">
            <p>Drag and drop or</p>
            <label
              htmlFor="file-upload"
              className="relative cursor-pointer rounded-sm pl-1 font-medium text-gray-700 hover:text-gray-900 hover:underline hover:underline-offset-4"
            >
              <span>choose files</span>
              <input
                id="file-upload"
                name="file-upload"
                type="file"
                className="sr-only"
                accept=".pdf,application/pdf"
                multiple
                onChange={handleFileChange}
                ref={fileInputRef}
                disabled={uploading}
              />
            </label>
            <p className="pl-1">to upload</p>
          </div>
          <p className="mt-2 text-xs text-gray-500">PDF files only, up to 100MB each</p>
        </div>
      </div>

      <p className="text-xs leading-5 text-gray-600 sm:flex sm:items-center sm:justify-between">
        <span>Accepted file types: PDF files only.</span>
        <span className="pl-1 sm:pl-0">Max. size: 100MB per file</span>
      </p>

      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file, index) => (
            <div
              key={index}
              className="relative bg-gray-50 rounded-md border border-gray-200 p-4"
            >
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1 h-8 w-8 text-gray-600 hover:text-gray-900"
                aria-label="Remove"
                onClick={() => removeFile(index)}
                disabled={uploading}
              >
                <X className="h-5 w-5 shrink-0" aria-hidden={true} />
              </Button>

              <div className="flex items-center space-x-2.5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-white shadow-sm ring-1 ring-inset ring-gray-300">
                  {getFileIcon()}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-900 truncate">
                    {file.name}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-600">
                    {formatFileSize(file.size)}
                  </p>
                </div>
              </div>

              {uploading && (
                <div className="flex items-center space-x-3 mt-3">
                  <Progress value={currentProgress} className="h-1.5 flex-1" />
                  <span className="text-xs text-gray-600">{currentProgress}%</span>
                </div>
              )}

              {file.error && (
                <p className="mt-2 text-xs text-red-600">{file.error}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {uploading && (
        <div className="flex items-center justify-end space-x-3">
          <Button
            type="button"
            variant="outline"
            className="whitespace-nowrap"
            onClick={resetFiles}
            disabled={uploading}
          >
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}

