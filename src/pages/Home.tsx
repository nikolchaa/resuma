import { useEffect, useMemo, useState } from "react";
import { SettingsButton } from "@/components/Settings";
import Logo from "../assets/Logo.svg?react";
import { useNavigate } from "react-router-dom";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, Plus, SquarePen, Trash, Upload } from "lucide-react";
import {
  deleteResume,
  listResumes,
  loadResume,
  ResumeData,
  saveResume,
} from "@/lib/resumesStore";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { open, save } from "@tauri-apps/plugin-dialog";
import { showError, showSuccess, showWarning } from "@/lib/toastUtils";
import { ConfirmationModal } from "@/components/ConfirmationModal";

export const Home = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("recent");
  const [resumes, setResumes] = useState<ResumeData[]>([]);

  useEffect(() => {
    listResumes().then(setResumes);
  }, []);

  const [showDelete, setShowDelete] = useState(false);
  const [targetId, setTargetId] = useState<string | null>(null);

  const handleDeleteClick = (id: string) => {
    setTargetId(id);
    setShowDelete(true);
  };

  const confirmDelete = async () => {
    if (!targetId) return;
    try {
      await deleteResume(targetId);
      const updated = await listResumes();
      setResumes(updated);
      setShowDelete(false);
      setTargetId(null);

      showSuccess("Resume deleted", "The resume has been permanently removed.");
    } catch (error) {
      showError("Failed to delete resume", (error as Error).message);
    }
  };

  const handleExport = async (id: string) => {
    try {
      const resume = await loadResume(id);
      if (!resume) {
        showError("Resume not found");
        return;
      }

      const filePath = await save({
        defaultPath: `${resume.id}.resume`,
        filters: [{ name: "Resume File", extensions: ["resume"] }],
      });

      if (!filePath) {
        showWarning("Export canceled", "No file was saved");
        return;
      }

      const content = JSON.stringify(resume, null, 2);
      await writeTextFile(filePath, content);

      showSuccess("Resume exported successfully", `Saved at: ${filePath}`);
    } catch (error) {
      showError(
        "Export failed",
        (error as Error).message || "An unexpected error occurred."
      );
    }
  };

  const slugify = (text: string) =>
    text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  const getUniqueId = async (base: string): Promise<string> => {
    const existing = await listResumes();
    const ids = new Set(existing.map((r) => r.id));
    if (!ids.has(base)) return base;
    let suffix = 1;
    let candidate = `${base}-${suffix}`;
    while (ids.has(candidate)) {
      suffix++;
      candidate = `${base}-${suffix}`;
    }
    return candidate;
  };

  const handleImport = async () => {
    try {
      const selected = await open({
        filters: [{ name: "Resuma Resume", extensions: ["resume"] }],
        multiple: false,
      });

      if (!selected) {
        showWarning("Import canceled");
        return;
      }

      const raw = await readTextFile(selected);
      const parsed = JSON.parse(raw) as ResumeData;

      // Create safe, unique ID
      const baseId = slugify(parsed.id || parsed.title || "imported-resume");
      const uniqueId = await getUniqueId(baseId);

      const resumeToSave: ResumeData = {
        id: uniqueId,
        title: parsed.title || "Imported Resume",
        updated: new Date().toISOString(),
        image:
          parsed.image || "https://placehold.co/210x297?text=Imported+Resume",
        content: parsed.content,
        jobDesc: parsed.jobDesc ?? undefined,
      };

      await saveResume(resumeToSave);
      showSuccess(
        "Resume imported successfully",
        `Title: ${resumeToSave.title}`
      );
      navigate(`/editor/${resumeToSave.id}`);
    } catch (err) {
      showError("Failed to import resume", (err as Error).message);
    }
  };

  const filteredAndSorted = useMemo(() => {
    const filtered = resumes.filter((res) =>
      res.title.toLowerCase().includes(query.toLowerCase())
    );

    return [...filtered].sort((a, b) => {
      switch (sort) {
        case "recent":
          return new Date(b.updated).getTime() - new Date(a.updated).getTime();
        case "oldest":
          return new Date(a.updated).getTime() - new Date(b.updated).getTime();
        case "a-z":
          return a.title.localeCompare(b.title);
        case "z-a":
          return b.title.localeCompare(a.title);
        default:
          return 0;
      }
    });
  }, [query, sort, resumes]);

  return (
    <>
      <div className='flex w-full flex-col items-center mt-36 mb-36'>
        <Logo className='h-20' />
      </div>

      {/* Search, Sort, Add */}
      <div className='flex flex-wrap items-center justify-between gap-4 max-w-[50rem] mx-auto mb-4'>
        <Input
          placeholder='Search resumes...'
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className='flex-2'
        />
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className='w-36'>
            <SelectValue placeholder='Sort by' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='recent'>Most Recent</SelectItem>
            <SelectItem value='oldest'>Oldest</SelectItem>
            <SelectItem value='a-z'>Name A–Z</SelectItem>
            <SelectItem value='z-a'>Name Z–A</SelectItem>
          </SelectContent>
        </Select>
        <Button variant={"outline"} onClick={() => handleImport()}>
          <Upload className='h-4 w-4' />
        </Button>
        <Button onClick={() => navigate("/new")}>
          <Plus className='h-4 w-4' /> New Resume
        </Button>
      </div>

      {/* Resume cards grid */}
      <div className='grid grid-cols-4 max-w-[75rem] w-[calc(100vw-12.5rem)] gap-4 mx-auto mb-20'>
        {filteredAndSorted.length > 0 ? (
          filteredAndSorted.map((res) => (
            <Card key={res.id} className='w-full overflow-hidden'>
              <div className='flex flex-col transition h-full'>
                <div className='px-6 pb-6'>
                  <img
                    src={res.image}
                    alt={res.title}
                    className='w-full object-cover rounded-sm aspect-[1/1.4142] border'
                  />
                </div>
                <CardHeader className='mt-auto'>
                  <CardTitle className='truncate'>{res.title}</CardTitle>
                  <CardDescription className='truncate'>
                    Last updated:{" "}
                    {new Date(res.updated).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </CardDescription>
                </CardHeader>
                <div className='flex items-center gap-2 px-6 pt-4'>
                  <Button
                    className='flex-1'
                    onClick={() => navigate(`/editor/${res.id}`)}
                  >
                    <SquarePen className='h-4 w-4' />
                    Edit
                  </Button>

                  <Button
                    size='icon'
                    variant='ghost'
                    onClick={() => handleExport(res.id)}
                  >
                    <Download className='w-4 h-4' />
                  </Button>

                  <Button
                    size='icon'
                    variant='ghost'
                    className='text-destructive hover:bg-destructive/10'
                    onClick={() => handleDeleteClick(res.id)}
                  >
                    <Trash className='w-4 h-4' />
                  </Button>
                </div>
              </div>
            </Card>
          ))
        ) : (
          <div className='col-span-4 text-center'>
            <p className='text-muted-foreground'>
              No resumes found. Create a new one!
            </p>
          </div>
        )}
        <ConfirmationModal
          open={showDelete}
          title='Delete Resume?'
          description='This action will permanently delete the resume and cannot be undone.'
          confirmVariant='destructive'
          confirmLabel='Confirm'
          cancelLabel='Cancel'
          onCancel={() => setShowDelete(false)}
          onConfirm={confirmDelete}
        />
      </div>

      <SettingsButton />
    </>
  );
};
