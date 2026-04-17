import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Upload,
  FileVideo,
  CheckCircle2,
  Sparkles,
  LayoutPanelTop,
  ScanSearch,
  Loader2,
  Download,
  RefreshCw,
  Copy,
} from "lucide-react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { motion } from "framer-motion";

function makeSubmissionId() {
  return `SUB-${Date.now().toString().slice(-6)}`;
}

type StoredSubmission = {
  id: string;
  createdAt: string;
  clipTitle: string;
  notes: string;
  videoName: string;
  fileName: string;
  detectedPlayer: string;
  jerseyNumber: string;
  teamName: string;
  viewType: string;
  haloDetected: string;
  phase: string;
  sourceType: string;
  clipLength: string;
  videoPath?: string;
};

type DetectedFields = {
  playerName: string;
  jerseyNumber: string;
  teamName: string;
  detectedPhase: string;
  haloDetected: string;
  analysisStatus: string;
};

const emptyDetectedFields: DetectedFields = {
  playerName: "",
  jerseyNumber: "",
  teamName: "",
  detectedPhase: "",
  haloDetected: "",
  analysisStatus: "",
};

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
const backendEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

let cachedSupabase: SupabaseClient | null = null;
function getSupabase() {
  if (!backendEnabled) return null;
  if (!cachedSupabase) {
    cachedSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return cachedSupabase;
}

async function loadSavedSubmissionsFromBackend(): Promise<StoredSubmission[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("submissions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(25);

  if (error) throw error;

  return (data || []).map((row: any) => ({
    id: row.id,
    createdAt: row.created_at,
    clipTitle: row.clip_title || "",
    notes: row.notes || "",
    videoName: row.video_name || row.file_name || "",
    fileName: row.file_name || row.video_name || "",
    detectedPlayer: row.detected_player || "",
    jerseyNumber: row.jersey_number || "",
    teamName: row.team_name || "",
    viewType: row.view_type || "",
    haloDetected: row.halo_detected || "",
    phase: row.phase || "",
    sourceType: row.source_type || "",
    clipLength: row.clip_length || "",
    videoPath: row.video_path || "",
  }));
}

async function saveSubmissionToBackend(submission: StoredSubmission, file: File | null) {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Backend not configured");

  let videoPath = submission.videoPath || "";
  if (file) {
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    videoPath = `clips/${submission.id}/${sanitizedName}`;
    const { error: uploadError } = await supabase.storage
      .from("clips")
      .upload(videoPath, file, { upsert: true, contentType: file.type || "video/mp4" });
    if (uploadError) throw uploadError;
  }

  const payload = {
    id: submission.id,
    created_at: submission.createdAt,
    clip_title: submission.clipTitle,
    notes: submission.notes,
    video_name: submission.videoName,
    file_name: submission.fileName,
    detected_player: submission.detectedPlayer,
    jersey_number: submission.jerseyNumber,
    team_name: submission.teamName,
    view_type: submission.viewType,
    halo_detected: submission.haloDetected,
    phase: submission.phase,
    source_type: submission.sourceType,
    clip_length: submission.clipLength,
    video_path: videoPath,
  };

  const { error } = await supabase.from("submissions").upsert(payload);
  if (error) throw error;

  return { ...submission, videoPath };
}

async function makeVideoUrlFromPath(path: string) {
  const supabase = getSupabase();
  if (!supabase || !path) return null;
  const { data, error } = await supabase.storage.from("clips").createSignedUrl(path, 60 * 60);
  if (error) throw error;
  return data?.signedUrl || null;
}

function Card(props: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`card ${props.className || ""}`.trim()} />;
}

function CardHeader(props: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`card-header ${props.className || ""}`.trim()} />;
}

function CardTitle(props: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 {...props} className={`card-title ${props.className || ""}`.trim()} />;
}

function CardDescription(props: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p {...props} className={`card-description ${props.className || ""}`.trim()} />;
}

function CardContent(props: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`card-content ${props.className || ""}`.trim()} />;
}

function Button(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "outline" }
) {
  const { variant = "primary", className = "", ...rest } = props;
  return <button {...rest} className={`btn btn-${variant} ${className}`.trim()} />;
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`input ${props.className || ""}`.trim()} />;
}

function Badge(props: React.HTMLAttributes<HTMLSpanElement>) {
  return <span {...props} className={`badge ${props.className || ""}`.trim()} />;
}

function Progress({ value }: { value: number }) {
  return (
    <div className="progress">
      <div className="progress-bar" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export default function App() {
  const [dragActive, setDragActive] = useState(false);
  const [videoName, setVideoName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [submissionId, setSubmissionId] = useState("");
  const [clipTitle, setClipTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [savedSubmissions, setSavedSubmissions] = useState<StoredSubmission[]>([]);
  const [reopenedSubmission, setReopenedSubmission] = useState<StoredSubmission | null>(null);
  const [detectedFields, setDetectedFields] = useState<DetectedFields>(emptyDetectedFields);
  const [saveError, setSaveError] = useState("");
  const [reportJsonOpen, setReportJsonOpen] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const clipDerivedFields = {
    clipLength: selectedFile || reopenedSubmission ? "00:18" : "",
    viewType: selectedFile ? "Split-screen" : reopenedSubmission?.viewType || "",
    sourceType: selectedFile || reopenedSubmission ? "Video clip" : "",
  };

  const completion = Math.min(
    100,
    25 + (videoName ? 35 : 0) + (clipTitle ? 20 : 0) + (notes ? 20 : 0)
  );

  useEffect(() => {
    return () => {
      if (videoUrl && videoUrl.startsWith("blob:")) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  const loadSavedSubmissions = async () => {
    try {
      if (backendEnabled) {
        const saved = await loadSavedSubmissionsFromBackend();
        setSavedSubmissions(saved);
        return;
      }
      const saved = JSON.parse(localStorage.getItem("cvfc-submissions") || "[]") as StoredSubmission[];
      setSavedSubmissions(saved);
    } catch {
      setSavedSubmissions([]);
    }
  };

  useEffect(() => {
    loadSavedSubmissions();
  }, []);

  const handleFileSelect = (file: File | null) => {
    if (!file) return;
    if (videoUrl && videoUrl.startsWith("blob:")) URL.revokeObjectURL(videoUrl);
    setSaveError("");
    setReopenedSubmission(null);
    setDetectedFields(emptyDetectedFields);
    setSelectedFile(file);
    setVideoName(file.name);
    setVideoUrl(URL.createObjectURL(file));
  };

  const resultData = useMemo(
    () => ({
      summary:
        "The system identified the highlighted player as the wide outlet and flagged a useful attacking build-up moment with an outside lane available.",
      keyPoint:
        "If the first defender commits, the wide lane is the first threat. If the second defender slides, the inside option becomes the next picture.",
      openOption: "Central pocket opens if help shifts wide.",
    }),
    []
  );

  useEffect(() => {
    if (!submitted) return;
    setIsProcessing(true);
    setShowResult(false);
    const timer = window.setTimeout(() => {
      setIsProcessing(false);
      setShowResult(true);
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [submitted]);

  const handleGenerate = async () => {
    const id = makeSubmissionId();
    setSubmissionId(id);
    setSaveError("");

    const nextDetected: DetectedFields = {
      playerName: "Grant Bason",
      jerseyNumber: "7",
      teamName: "Carolina Velocity FC - U13 Boys 2013 | NAL (QPR)",
      detectedPhase: "Attacking build-up",
      haloDetected: "Yes",
      analysisStatus: "Report ready",
    };
    setDetectedFields(nextDetected);

    const submission: StoredSubmission = {
      id,
      createdAt: new Date().toISOString(),
      clipTitle,
      notes,
      videoName,
      fileName: selectedFile?.name || videoName,
      detectedPlayer: nextDetected.playerName,
      jerseyNumber: nextDetected.jerseyNumber,
      teamName: nextDetected.teamName,
      viewType: clipDerivedFields.viewType,
      haloDetected: nextDetected.haloDetected,
      phase: nextDetected.detectedPhase,
      sourceType: clipDerivedFields.sourceType,
      clipLength: clipDerivedFields.clipLength,
      videoPath: reopenedSubmission?.videoPath || "",
    };

    try {
      if (backendEnabled) {
        await saveSubmissionToBackend(submission, selectedFile);
        await loadSavedSubmissions();
      } else {
        const existing = JSON.parse(localStorage.getItem("cvfc-submissions") || "[]") as StoredSubmission[];
        const next = [submission, ...existing].slice(0, 25);
        localStorage.setItem("cvfc-submissions", JSON.stringify(next));
        setSavedSubmissions(next);
      }
    } catch (error: any) {
      setSaveError(error?.message || "Unable to save submission to backend.");
    }

    setSubmitted(false);
    window.setTimeout(() => setSubmitted(true), 0);
  };

  const openSavedSubmission = async (item: StoredSubmission) => {
    if (videoUrl && videoUrl.startsWith("blob:")) URL.revokeObjectURL(videoUrl);
    setSelectedFile(null);
    setVideoUrl(null);
    setVideoName(item.videoName || item.fileName || "Saved clip");
    setClipTitle(item.clipTitle || "");
    setNotes(item.notes || "");
    setSubmissionId(item.id);
    setReopenedSubmission(item);
    setDetectedFields({
      playerName: item.detectedPlayer || "",
      jerseyNumber: item.jerseyNumber || "",
      teamName: item.teamName || "",
      detectedPhase: item.phase || "",
      haloDetected: item.haloDetected || "",
      analysisStatus: item.detectedPlayer ? "Report ready" : "",
    });

    if (backendEnabled && item.videoPath) {
      try {
        const signedUrl = await makeVideoUrlFromPath(item.videoPath);
        setVideoUrl(signedUrl);
      } catch {
        setVideoUrl(null);
      }
    }

    setSubmitted(true);
    setIsProcessing(false);
    setShowResult(true);
  };

  const reportPayload = useMemo(
    () => ({
      submissionId,
      player: `${detectedFields.playerName} #${detectedFields.jerseyNumber}`,
      phase: detectedFields.detectedPhase,
      summary: resultData.summary,
      mainPoint: resultData.keyPoint,
      nextOpenOption: resultData.openOption,
      clipTitle,
      notes,
      videoName,
    }),
    [submissionId, detectedFields, resultData, clipTitle, notes, videoName]
  );

  const reportJson = useMemo(() => JSON.stringify(reportPayload, null, 2), [reportPayload]);

  const handleDownload = () => {
    try {
      const blob = new Blob([reportJson], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${submissionId || "clip-report"}.json`;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      window.setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 1000);
    } catch {
      setReportJsonOpen(true);
    }
  };

  const handleCopyJson = async () => {
    try {
      await navigator.clipboard.writeText(reportJson);
      setCopyMessage("Copied");
      window.setTimeout(() => setCopyMessage(""), 1200);
    } catch {
      setCopyMessage("Copy failed");
      window.setTimeout(() => setCopyMessage(""), 1200);
    }
  };

  const resetToUpload = () => {
    if (videoUrl && videoUrl.startsWith("blob:")) URL.revokeObjectURL(videoUrl);
    setSubmitted(false);
    setShowResult(false);
    setIsProcessing(false);
    setSubmissionId("");
    setSelectedFile(null);
    setVideoUrl(null);
    setVideoName("");
    setClipTitle("");
    setNotes("");
    setReopenedSubmission(null);
    setDetectedFields(emptyDetectedFields);
    setSaveError("");
    loadSavedSubmissions();
  };

  return (
    <div className="page">
      <div className="container">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-24">
          <Card>
            <CardContent>
              <div className="stack-12">
                <Badge>Carolina Velocity FC - U13 Boys 2013 | NAL (QPR)</Badge>
                <div>
                  <h1 className="hero-title">Carolina Velocity FC clip report studio</h1>
                  <p className="hero-subtitle">
                    Upload a clip, let the system detect the highlighted player and view type,
                    and generate a one-page clip report.
                  </p>
                  <p className="tiny-muted">
                    Backend mode: {backendEnabled ? "Supabase connected" : "Browser-only fallback"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {!submitted || isProcessing ? (
          <Card>
            <CardHeader>
              <CardTitle>Clip upload</CardTitle>
              <CardDescription>
                Start with a single clip. The system detects split-screen versus single-view,
                finds the highlighted player, and fills in the obvious fields automatically.
              </CardDescription>
            </CardHeader>

            <CardContent>
              <motion.div
                whileHover={{ scale: 1.01 }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragActive(false);
                  const file = e.dataTransfer.files?.[0] || null;
                  handleFileSelect(file);
                }}
                className={`dropzone ${dragActive ? "dropzone-active" : ""}`}
              >
                {!videoName ? (
                  <div className="dropzone-inner">
                    <div className="upload-icon-wrap">
                      <Upload size={24} />
                    </div>
                    <h3 className="section-heading">Drop in a clip and let the system do the rest</h3>
                    <p className="muted">No player selection, no analysis type, no split-screen question.</p>
                    <div className="row-center">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="video/*"
                        className="hidden"
                        onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
                      />
                      <Button type="button" onClick={() => fileInputRef.current?.click()}>
                        Choose file
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="stack-16">
                    <div className="row-between wrap gap-12">
                      <div className="pill">
                        <FileVideo size={16} /> {videoName}
                      </div>
                      <div className="row wrap gap-8">
                        {clipDerivedFields.viewType && (
                          <Badge className="badge-outline">
                            <LayoutPanelTop size={14} /> {clipDerivedFields.viewType}
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="video-shell">
                      {videoUrl ? (
                        <video src={videoUrl} controls className="video-player" />
                      ) : (
                        <div className="video-placeholder">Video preview unavailable for saved submission</div>
                      )}
                    </div>
                  </div>
                )}
              </motion.div>

              <div className="two-col">
                <div>
                  <label className="field-label">Game or clip title</label>
                  <Input
                    value={clipTitle}
                    onChange={(e) => setClipTitle(e.target.value)}
                    placeholder="Add a game or clip title"
                  />
                </div>

                {(selectedFile || reopenedSubmission) && (
                  <div>
                    <label className="field-label">System detection</label>
                    <div className="detector-box">
                      <ScanSearch size={16} /> Auto-detect everything possible
                    </div>
                  </div>
                )}
              </div>

              {(selectedFile || reopenedSubmission || showResult) && (
                <Card className="subtle-card">
                  <CardHeader>
                    <CardTitle>Detected details</CardTitle>
                    <CardDescription>
                      These fields appear after the clip is read. You can edit the detected values if anything is wrong.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid-3">
                      {clipDerivedFields.clipLength && (
                        <div>
                          <label className="field-label">Clip length</label>
                          <Input value={clipDerivedFields.clipLength} readOnly />
                        </div>
                      )}
                      {clipDerivedFields.viewType && (
                        <div>
                          <label className="field-label">View type</label>
                          <Input value={clipDerivedFields.viewType} readOnly />
                        </div>
                      )}
                      {clipDerivedFields.sourceType && (
                        <div>
                          <label className="field-label">Source type</label>
                          <Input value={clipDerivedFields.sourceType} readOnly />
                        </div>
                      )}
                      {showResult && (
                        <>
                          <div>
                            <label className="field-label">Detected player</label>
                            <Input
                              value={detectedFields.playerName}
                              onChange={(e) =>
                                setDetectedFields((prev) => ({ ...prev, playerName: e.target.value }))
                              }
                            />
                          </div>
                          <div>
                            <label className="field-label">Jersey #</label>
                            <Input
                              value={detectedFields.jerseyNumber}
                              onChange={(e) =>
                                setDetectedFields((prev) => ({ ...prev, jerseyNumber: e.target.value }))
                              }
                            />
                          </div>
                          <div>
                            <label className="field-label">Team</label>
                            <Input
                              value={detectedFields.teamName}
                              onChange={(e) =>
                                setDetectedFields((prev) => ({ ...prev, teamName: e.target.value }))
                              }
                            />
                          </div>
                          <div>
                            <label className="field-label">Phase detected</label>
                            <Input
                              value={detectedFields.detectedPhase}
                              onChange={(e) =>
                                setDetectedFields((prev) => ({ ...prev, detectedPhase: e.target.value }))
                              }
                            />
                          </div>
                          <div>
                            <label className="field-label">Halo detected</label>
                            <Input
                              value={detectedFields.haloDetected}
                              onChange={(e) =>
                                setDetectedFields((prev) => ({ ...prev, haloDetected: e.target.value }))
                              }
                            />
                          </div>
                          <div>
                            <label className="field-label">System status</label>
                            <Input
                              value={detectedFields.analysisStatus}
                              onChange={(e) =>
                                setDetectedFields((prev) => ({ ...prev, analysisStatus: e.target.value }))
                              }
                            />
                          </div>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              <div>
                <div className="row-between">
                  <label className="field-label">What should the analysis focus on?</label>
                  <span className="tiny-muted">Optional</span>
                </div>
                <p className="muted compact">
                  Add any specific question or point you want covered in the report. For example:
                  should he attack here, was another option open, or did he read the second defender correctly?
                </p>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="textarea"
                  placeholder="Add any specific question or point you want covered in the report"
                />
              </div>

              {saveError && <div className="error-box">{saveError}</div>}

              <Card className="subtle-card">
                <CardHeader>
                  <CardTitle>{isProcessing ? "Generating report" : "Submission progress"}</CardTitle>
                  <CardDescription>
                    {isProcessing
                      ? "Saving the submission, creating a mock analysis response, and preparing the results view."
                      : "The uploader stays simple, but the system still shows what it detected."}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {isProcessing ? (
                    <div className="row gap-12 muted">
                      <Loader2 size={18} className="spin" />
                      Working on a mock report...
                    </div>
                  ) : (
                    <>
                      <Progress value={completion} />
                      <div className="tiny-muted mt-8">{completion}% complete</div>
                      <div className="stack-8 mt-12">
                        <div className="check-row">
                          <CheckCircle2 size={16} className={videoName ? "ok" : "muted-icon"} />
                          Clip uploaded
                        </div>
                        <div className="check-row">
                          <CheckCircle2 size={16} className={clipTitle ? "ok" : "muted-icon"} />
                          Game or clip title added
                        </div>
                        {(selectedFile || reopenedSubmission) && (
                          <>
                            <div className="check-row">
                              <CheckCircle2 size={16} className="ok" />
                              Split-screen vs single-view auto-detected
                            </div>
                            <div className="check-row">
                              <CheckCircle2 size={16} className="ok" />
                              Clip metadata auto-filled
                            </div>
                          </>
                        )}
                        {showResult && (
                          <>
                            <div className="check-row">
                              <CheckCircle2 size={16} className="ok" />
                              Player auto-detected from highlight
                            </div>
                            <div className="check-row">
                              <CheckCircle2 size={16} className="ok" />
                              Jersey number and team auto-filled
                            </div>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              <div className="row wrap gap-12">
                <Button onClick={handleGenerate} disabled={!videoName}>
                  <Sparkles size={16} /> Generate report
                </Button>
              </div>

              <Card className="subtle-card">
                <CardHeader>
                  <CardTitle>Saved submissions</CardTitle>
                  <CardDescription>
                    {backendEnabled ? "Recent clip submissions from Supabase." : "Recent clip submissions saved in this browser."}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {savedSubmissions.length === 0 ? (
                    <div className="empty-box">No saved submissions yet.</div>
                  ) : (
                    <div className="stack-12">
                      {savedSubmissions.slice(0, 5).map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => openSavedSubmission(item)}
                          className="saved-item"
                        >
                          <div className="row-between wrap gap-12">
                            <div>
                              <div className="saved-title">{item.clipTitle || item.videoName || "Untitled clip"}</div>
                              <div className="saved-meta">{item.id} · {item.fileName || item.videoName}</div>
                            </div>
                            <Badge className="badge-outline">
                              {new Date(item.createdAt).toLocaleDateString()}
                            </Badge>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </CardContent>
          </Card>
        ) : (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <Card>
              <CardHeader>
                <div className="row-between wrap gap-12">
                  <div>
                    <CardTitle>Generated result</CardTitle>
                    <CardDescription>
                      {backendEnabled
                        ? "The submission is now stored in Supabase and the selected file is uploaded to storage."
                        : "The submission is stored locally and the analysis response is still mocked."}
                    </CardDescription>
                  </div>
                  <div className="row wrap gap-12">
                    <Button variant="outline" onClick={handleGenerate}>
                      <RefreshCw size={16} /> Regenerate
                    </Button>
                    <Button onClick={handleDownload}>
                      <Download size={16} /> Download report
                    </Button>
                    <Button variant="outline" onClick={() => setReportJsonOpen((v) => !v)}>
                      <Copy size={16} /> {reportJsonOpen ? "Hide JSON" : "Show JSON"}
                    </Button>
                  </div>
                </div>
              </CardHeader>

              <CardContent>
                <div className="video-shell">
                  {videoUrl ? (
                    <video src={videoUrl} controls className="video-player" />
                  ) : (
                    <div className="video-placeholder">Video preview unavailable for saved submission</div>
                  )}
                </div>

                <div className="grid-4 mt-16">
                  <div className="metric-card">
                    <div className="metric-label">Detected player</div>
                    <div className="metric-value">
                      {detectedFields.playerName} · #{detectedFields.jerseyNumber}
                    </div>
                  </div>
                  <div className="metric-card">
                    <div className="metric-label">Submission ID</div>
                    <div className="metric-value">{submissionId || "Pending"}</div>
                  </div>
                  <div className="metric-card">
                    <div className="metric-label">Phase</div>
                    <div className="metric-value">{detectedFields.detectedPhase}</div>
                  </div>
                  <div className="metric-card">
                    <div className="metric-label">Next open option</div>
                    <div className="metric-value">{resultData.openOption}</div>
                  </div>
                </div>

                <Card className="subtle-card mt-16">
                  <CardHeader>
                    <CardTitle>Detected details</CardTitle>
                    <CardDescription>You can edit the detected values here if the auto-detect is wrong.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid-3">
                      <div>
                        <label className="field-label">Detected player</label>
                        <Input
                          value={detectedFields.playerName}
                          onChange={(e) =>
                            setDetectedFields((prev) => ({ ...prev, playerName: e.target.value }))
                          }
                        />
                      </div>
                      <div>
                        <label className="field-label">Jersey #</label>
                        <Input
                          value={detectedFields.jerseyNumber}
                          onChange={(e) =>
                            setDetectedFields((prev) => ({ ...prev, jerseyNumber: e.target.value }))
                          }
                        />
                      </div>
                      <div>
                        <label className="field-label">Team</label>
                        <Input
                          value={detectedFields.teamName}
                          onChange={(e) =>
                            setDetectedFields((prev) => ({ ...prev, teamName: e.target.value }))
                          }
                        />
                      </div>
                      <div>
                        <label className="field-label">Phase detected</label>
                        <Input
                          value={detectedFields.detectedPhase}
                          onChange={(e) =>
                            setDetectedFields((prev) => ({ ...prev, detectedPhase: e.target.value }))
                          }
                        />
                      </div>
                      <div>
                        <label className="field-label">Halo detected</label>
                        <Input
                          value={detectedFields.haloDetected}
                          onChange={(e) =>
                            setDetectedFields((prev) => ({ ...prev, haloDetected: e.target.value }))
                          }
                        />
                      </div>
                      <div>
                        <label className="field-label">System status</label>
                        <Input
                          value={detectedFields.analysisStatus}
                          onChange={(e) =>
                            setDetectedFields((prev) => ({ ...prev, analysisStatus: e.target.value }))
                          }
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {reportJsonOpen && (
                  <Card className="subtle-card mt-16">
                    <CardHeader>
                      <div className="row-between wrap gap-12">
                        <div>
                          <CardTitle>Report JSON</CardTitle>
                          <CardDescription>
                            Use this if the preview blocks downloads. You can copy it and save it manually.
                          </CardDescription>
                        </div>
                        <Button variant="outline" onClick={handleCopyJson}>
                          <Copy size={16} /> {copyMessage || "Copy JSON"}
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <textarea value={reportJson} readOnly className="textarea code-area" />
                    </CardContent>
                  </Card>
                )}

                <div className="summary-box mt-16">
                  <div>
                    <div className="field-label">Summary</div>
                    <p className="muted compact">{resultData.summary}</p>
                  </div>
                  <div>
                    <div className="field-label">Main point</div>
                    <p className="muted compact">{resultData.keyPoint}</p>
                  </div>
                </div>

                <div className="row wrap gap-12 mt-16">
                  <Button variant="outline" onClick={resetToUpload}>
                    Upload another clip
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>
    </div>
  );
}
