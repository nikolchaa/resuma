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
import { Plus, SquarePen, Trash } from "lucide-react";
import {
  deleteResume,
  listResumes,
  ResumeData,
} from "@/lib/resumesStore";
import { showError, showSuccess } from "@/lib/toastUtils";
import { ConfirmationModal } from "@/components/ConfirmationModal";
import { useLanguage } from "@/contexts/LanguageContext";

export const Home = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
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

      showSuccess(t("home.toast.deletedTitle"), t("home.toast.deletedDesc"));
    } catch (error) {
      showError(t("home.toast.deleteFailed"), (error as Error).message);
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
          placeholder={t("home.search.placeholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className='flex-2'
        />
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className='w-36'>
            <SelectValue placeholder={t("home.sort.placeholder")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='recent'>{t("home.sort.recent")}</SelectItem>
            <SelectItem value='oldest'>{t("home.sort.oldest")}</SelectItem>
            <SelectItem value='a-z'>{t("home.sort.az")}</SelectItem>
            <SelectItem value='z-a'>{t("home.sort.za")}</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={() => navigate("/new")}>
          <Plus className='h-4 w-4' /> {t("home.newResume")}
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
                    {t("home.lastUpdated")}{" "}
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
                    {t("home.edit")}
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
              {t("home.empty")}
            </p>
          </div>
        )}
        <ConfirmationModal
          open={showDelete}
          title={t("home.delete.title")}
          description={t("home.delete.description")}
          confirmVariant='destructive'
          confirmLabel={t("common.confirm")}
          cancelLabel={t("common.cancel")}
          onCancel={() => setShowDelete(false)}
          onConfirm={confirmDelete}
        />
      </div>

      <SettingsButton />
    </>
  );
};
