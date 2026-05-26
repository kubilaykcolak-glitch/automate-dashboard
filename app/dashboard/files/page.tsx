"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import {
  Download,
  File as FileIcon,
  FileSpreadsheet,
  FileText,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import {
  BYPASS_STORAGE,
  STORAGE_LIMIT_BYTES,
  deleteFile,
  subscribeFiles,
  uploadFile,
} from "@/lib/firebase/storage";
import type { StoredFile } from "@/types/database";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

const MAX_FILE_BYTES = 20 * 1024 * 1024;

const ACCEPT = {
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "application/vnd.ms-excel": [".xls"],
  "text/csv": [".csv"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    ".docx",
  ],
  "application/msword": [".doc"],
};

interface UploadJob {
  key: string;
  name: string;
  progress: number;
  error?: string;
}

const ACCEPT_EXTENSIONS = Object.values(ACCEPT).flat();

export default function FilesPage() {
  const { user, loading: authLoading } = useAuth();
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [uploads, setUploads] = useState<UploadJob[]>([]);
  const [pendingDelete, setPendingDelete] = useState<StoredFile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [replacingFile, setReplacingFile] = useState<StoredFile | null>(null);
  const replaceInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeFiles(
      user.uid,
      (next) => setFiles(next),
      (err) => toast.error(err.message)
    );
    return () => unsub();
  }, [user]);

  const onDrop = useCallback(
    async (accepted: File[], rejected: FileRejection[]) => {
      if (!user) {
        toast.error("You need to be signed in to upload.");
        return;
      }
      for (const rej of rejected) {
        const reason = rej.errors[0]?.message ?? "rejected";
        toast.error(`${rej.file.name}: ${reason}`);
      }
      for (const file of accepted) {
        const key = `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        setUploads((prev) => [
          ...prev,
          { key, name: file.name, progress: 0 },
        ]);
        try {
          await uploadFile(user.uid, file, (pct) => {
            setUploads((prev) =>
              prev.map((u) => (u.key === key ? { ...u, progress: pct } : u))
            );
          });
          toast.success(`Uploaded ${file.name}`);
          setUploads((prev) => prev.filter((u) => u.key !== key));
        } catch (e) {
          const message = e instanceof Error ? e.message : "Upload failed.";
          toast.error(`${file.name}: ${message}`);
          setUploads((prev) =>
            prev.map((u) => (u.key === key ? { ...u, error: message } : u))
          );
        }
      }
    },
    [user]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPT,
    maxSize: MAX_FILE_BYTES,
    disabled: authLoading || !user,
    multiple: true,
  });

  const totalBytes = useMemo(
    () => files.reduce((acc, f) => acc + (f.size ?? 0), 0),
    [files]
  );
  const pctUsed = Math.min(100, Math.round((totalBytes / STORAGE_LIMIT_BYTES) * 100));

  async function onDeleteConfirmed() {
    if (!user || !pendingDelete) return;
    const file = pendingDelete;
    setDeleting(true);
    try {
      await deleteFile(user.uid, file.name);
      toast.success(`Deleted ${file.name}`);
      setPendingDelete(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setDeleting(false);
    }
  }

  function onReplaceClick(file: StoredFile) {
    if (!user) return;
    setReplacingFile(file);
    // Reset so picking the same path twice still triggers onChange.
    if (replaceInputRef.current) replaceInputRef.current.value = "";
    replaceInputRef.current?.click();
  }

  async function onReplaceFileChosen(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const picked = event.target.files?.[0];
    const target = replacingFile;
    setReplacingFile(null);
    if (!picked || !user || !target) return;

    if (picked.size > MAX_FILE_BYTES) {
      toast.error(
        `${picked.name}: file is larger than ${formatBytes(MAX_FILE_BYTES)}.`
      );
      return;
    }

    // Preserve the original filename so the Firestore doc id, storage path,
    // and any chat attachments referencing this file stay valid.
    const renamed = new File([picked], target.name, {
      type: picked.type || target.type || "application/octet-stream",
      lastModified: picked.lastModified,
    });

    const key = `${target.name}-replace-${Date.now()}`;
    setUploads((prev) => [
      ...prev,
      { key, name: `Replacing ${target.name}`, progress: 0 },
    ]);
    try {
      await uploadFile(user.uid, renamed, (pct) => {
        setUploads((prev) =>
          prev.map((u) => (u.key === key ? { ...u, progress: pct } : u))
        );
      });
      toast.success(`Replaced ${target.name}`);
      setUploads((prev) => prev.filter((u) => u.key !== key));
    } catch (e) {
      const message = e instanceof Error ? e.message : "Replace failed.";
      toast.error(`${target.name}: ${message}`);
      setUploads((prev) =>
        prev.map((u) => (u.key === key ? { ...u, error: message } : u))
      );
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Files"
        subtitle="Upload documents your agents can search and cite."
        action={
          <div className="min-w-[16rem] space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Storage used</span>
              <span>
                {formatBytes(totalBytes)} / {formatBytes(STORAGE_LIMIT_BYTES)}
              </span>
            </div>
            <Progress value={pctUsed} />
          </div>
        }
      />

      {BYPASS_STORAGE && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          Storage is bypassed in dev — file bytes aren&apos;t uploaded, only
          metadata is saved. Disable <code className="font-mono">NEXT_PUBLIC_DEV_BYPASS_STORAGE</code>{" "}
          and enable Firebase Storage to upload real files.
        </div>
      )}

      <div
        {...getRootProps()}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed bg-card px-6 py-12 text-center transition-colors",
          isDragActive
            ? "border-primary/60 bg-accent/40"
            : "hover:border-foreground/40 hover:bg-accent/20",
          (authLoading || !user) && "cursor-not-allowed opacity-60"
        )}
      >
        <input {...getInputProps()} />
        <div className="rounded-full border bg-muted/50 p-3 text-muted-foreground">
          <Upload className="h-5 w-5" />
        </div>
        <div className="text-sm font-medium">
          {isDragActive
            ? "Drop files to upload"
            : "Drag files here or click to browse"}
        </div>
        <div className="text-xs text-muted-foreground">
          PDF, XLSX, CSV, DOCX · up to {formatBytes(MAX_FILE_BYTES)}
        </div>
      </div>

      {uploads.length > 0 && (
        <Card>
          <CardContent className="space-y-3 py-4">
            {uploads.map((u) => (
              <div key={u.key} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="truncate font-medium">{u.name}</span>
                  <span className="text-muted-foreground">
                    {u.error ? "Failed" : `${u.progress}%`}
                  </span>
                </div>
                <Progress
                  value={u.error ? 100 : u.progress}
                  className={u.error ? "bg-destructive/20" : undefined}
                />
                {u.error && (
                  <div className="text-xs text-destructive">{u.error}</div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        {files.length === 0 ? (
          <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <div className="rounded-full border bg-muted/50 p-3 text-muted-foreground">
              <FileIcon className="h-5 w-5" />
            </div>
            <div className="text-sm font-medium">No files yet</div>
            <p className="max-w-sm text-sm text-muted-foreground">
              Drop a PDF, spreadsheet, or doc above to get started.
            </p>
          </CardContent>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden sm:table-cell">Size</TableHead>
                <TableHead className="hidden md:table-cell">Uploaded</TableHead>
                <TableHead className="w-[120px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {files.map((file) => (
                <TableRow key={file.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <FileTypeIcon type={file.type} name={file.name} />
                      <span className="truncate font-medium">{file.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground">
                    {formatBytes(file.size)}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">
                    {file.createdAt
                      ? file.createdAt.toDate().toLocaleDateString()
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {file.downloadUrl ? (
                        <a
                          href={file.downloadUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Download ${file.name}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                        >
                          <Download className="h-4 w-4" />
                        </a>
                      ) : (
                        <span
                          aria-label="Download unavailable in bypass mode"
                          title="Download unavailable — Storage is bypassed in dev"
                          className="inline-flex h-8 w-8 cursor-not-allowed items-center justify-center rounded-md text-muted-foreground/40"
                        >
                          <Download className="h-4 w-4" />
                        </span>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        aria-label={`Replace ${file.name}`}
                        title="Replace with a new version (keeps the same name)"
                        onClick={() => onReplaceClick(file)}
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        aria-label={`Delete ${file.name}`}
                        onClick={() => setPendingDelete(file)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <input
        ref={replaceInputRef}
        type="file"
        className="hidden"
        accept={ACCEPT_EXTENSIONS.join(",")}
        onChange={onReplaceFileChosen}
      />

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this file?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? `"${pendingDelete.name}" will be removed permanently. Agents and chats that referenced it will no longer be able to read it.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={onDeleteConfirmed}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function FileTypeIcon({ type, name }: { type: string; name: string }) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (type === "application/pdf" || ext === "pdf") {
    return <FileText className="h-5 w-5 text-red-600" />;
  }
  if (ext === "xlsx" || ext === "xls" || ext === "csv" || type.includes("sheet") || type === "text/csv") {
    return <FileSpreadsheet className="h-5 w-5 text-emerald-600" />;
  }
  if (ext === "docx" || ext === "doc" || type.includes("word")) {
    return <FileText className="h-5 w-5 text-blue-600" />;
  }
  return <FileIcon className="h-5 w-5 text-muted-foreground" />;
}

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}
