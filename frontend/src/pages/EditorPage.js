import React, { useState, useRef, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import Client from "../components/Client";
import Editor from "../components/Editor";
import { language, cmtheme } from "../../src/atoms";
import { useRecoilState } from "recoil";
import ACTIONS from "../actions/Actions";
import { initSocket } from "../socket";
import { executeCode } from "../services/endpoints";
import {
  useLocation,
  useNavigate,
  Navigate,
  useParams,
} from "react-router-dom";

const languageOptions = [
  { value: "clike", label: "C / C++ / C#" },
  { value: "java", label: "Java" },
  { value: "css", label: "CSS" },
  { value: "dart", label: "Dart" },
  { value: "django", label: "Django" },
  { value: "dockerfile", label: "Dockerfile" },
  { value: "go", label: "Go" },
  { value: "htmlmixed", label: "HTML-mixed" },
  { value: "javascript", label: "JavaScript" },
  { value: "jsx", label: "JSX" },
  { value: "markdown", label: "Markdown" },
  { value: "php", label: "PHP" },
  { value: "python", label: "Python" },
  { value: "r", label: "R" },
  { value: "rust", label: "Rust" },
  { value: "ruby", label: "Ruby" },
  { value: "sass", label: "Sass" },
  { value: "shell", label: "Shell" },
  { value: "sql", label: "SQL" },
  { value: "swift", label: "Swift" },
  { value: "xml", label: "XML" },
  { value: "yaml", label: "yaml" },
];

const themeOptions = [
  "default",
  "3024-day",
  "3024-night",
  "abbott",
  "abcdef",
  "ambiance",
  "ayu-dark",
  "ayu-mirage",
  "base16-dark",
  "base16-light",
  "bespin",
  "blackboard",
  "cobalt",
  "colorforth",
  "darcula",
  "duotone-dark",
  "duotone-light",
  "eclipse",
  "elegant",
  "erlang-dark",
  "gruvbox-dark",
  "hopscotch",
  "icecoder",
  "idea",
  "isotope",
  "juejin",
  "lesser-dark",
  "liquibyte",
  "lucario",
  "material",
  "material-darker",
  "material-palenight",
  "material-ocean",
  "mbo",
  "mdn-like",
  "midnight",
  "monokai",
  "moxer",
  "neat",
  "neo",
  "night",
  "nord",
  "oceanic-next",
  "panda-syntax",
  "paraiso-dark",
  "paraiso-light",
  "pastel-on-dark",
  "railscasts",
  "rubyblue",
  "seti",
  "shadowfox",
  "solarized",
  "the-matrix",
  "tomorrow-night-bright",
  "tomorrow-night-eighties",
  "ttcn",
  "twilight",
  "vibrant-ink",
  "xq-dark",
  "xq-light",
  "yeti",
  "yonce",
  "zenburn",
];

// Map CodeMirror language modes to backend language format
const mapLanguageToBackend = (cmLang) => {
  const languageMap = {
    javascript: "javascript",
    jsx: "javascript",
    python: "python",
    java: "java",
    clike: "cpp", // C/C++/C#
    go: "go",
    rust: "rust",
    ruby: "ruby",
    php: "php",
    shell: "bash",
    r: "r",
    swift: "swift",
    dart: "dart",
  };
  return languageMap[cmLang] || cmLang;
};

const EditorPage = () => {
  const [lang, setLang] = useRecoilState(language);
  const [them, setThem] = useRecoilState(cmtheme);

  const [clients, setClients] = useState([]);
  const [terminalOutput, setTerminalOutput] = useState("");
  const [isExecuting, setIsExecuting] = useState(false);
  const [stdin] = useState("");
  const [isTerminalCollapsed, setIsTerminalCollapsed] = useState(false);
  const [socket, setSocket] = useState(null);

  const socketRef = useRef(null);
  const codeRef = useRef("");
  const location = useLocation();
  const { roomId } = useParams();
  const reactNavigator = useNavigate();

  const handleRunCode = useCallback(async () => {
    if (!codeRef.current || codeRef.current.trim() === "") {
      toast.error("No code to execute");
      return;
    }

    setIsExecuting(true);
    setTerminalOutput("Executing code...\n");

    try {
      const backendLanguage = mapLanguageToBackend(lang);
      const result = await executeCode(backendLanguage, codeRef.current, stdin);

      // Format the output
      let output = "";
      if (result.output !== undefined) {
        output += result.output;
      }
      if (result.error) {
        output += result.error;
      }
      if (result.stderr) {
        output += result.stderr;
      }
      if (result.stdout) {
        output += result.stdout;
      }

      setTerminalOutput(output || "Code executed successfully (no output)");
      toast.success("Code executed successfully");
    } catch (error) {
      const errorMessage = error.message || "Failed to execute code";
      setTerminalOutput(`Error: ${errorMessage}`);
      toast.error(errorMessage);
    } finally {
      setIsExecuting(false);
    }
  }, [lang, stdin]);

  const handleCodeChange = useCallback((code) => {
    codeRef.current = code;
  }, []);

  useEffect(() => {
    const init = async () => {
      const createdSocket = await initSocket();
      socketRef.current = createdSocket;
      setSocket(createdSocket);

      createdSocket.on("connect_error", (err) => handleErrors(err));
      createdSocket.on("connect_failed", (err) => handleErrors(err));

      function handleErrors(e) {
        console.log("socket error", e);
        toast.error(`Socket connection failed, try again later. ${e}`);
        reactNavigator("/");
      }

      createdSocket.emit(ACTIONS.JOIN, {
        roomId,
        username: location.state?.username,
      });

      // Listening for joined event
      createdSocket.on(
        ACTIONS.JOINED,
        ({ clients, username, socketId }) => {
          if (username !== location.state?.username) {
            toast.success(`${username} joined the room.`);
            console.log(`${username} joined`);
          }
          setClients(clients);
          createdSocket.emit(ACTIONS.SYNC_CODE, {
            code: codeRef.current,
            socketId,
          });
        }
      );

      // Listening for disconnected
      createdSocket.on(ACTIONS.DISCONNECTED, ({ socketId, username }) => {
        toast.success(`${username} left the room.`);
        setClients((prev) => {
          return prev.filter((client) => client.socketId !== socketId);
        });
      });
    };
    init();
    return () => {
      if (socketRef.current) {
        socketRef.current.off(ACTIONS.JOINED);
        socketRef.current.off(ACTIONS.DISCONNECTED);
        socketRef.current.disconnect();
        socketRef.current = null;
        setSocket(null);
      }
    };
  }, []);

  // Keyboard shortcut for running code (Ctrl+Enter)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handleRunCode();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleRunCode]);

  async function copyRoomId() {
    try {
      await navigator.clipboard.writeText(roomId);
      toast.success("Room ID has been copied to clipboard");
    } catch (err) {
      toast.error("Could not copy the Room ID");
      console.error(err);
    }
  }

  function leaveRoom() {
    reactNavigator("/");
  }

  const clearTerminal = () => {
    setTerminalOutput("");
  };

  const toggleTerminal = () => {
    setIsTerminalCollapsed(!isTerminalCollapsed);
  };

  if (!location.state) {
    return <Navigate to="/" />;
  }

  return (
    <div className="mainWrap">
      <div className="aside">
        <div className="asideInner">
          <div className="logo">
            <h1>ParallelCode</h1>
          </div>
          <h3>Connected</h3>
          <div className="clientsList">
            {clients.map((client) => (
              <Client key={client.socketId} username={client.username} />
            ))}
          </div>
        </div>

        <label>
          Select Language:
          <select
            value={lang}
            onChange={(e) => {
              setLang(e.target.value);
              window.location.reload();
            }}
            className="seLang"
          >
            {languageOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Select Theme:
          <select
            value={them}
            onChange={(e) => {
              //   setCode(codeRef.current);
              setThem(e.target.value);
              //   window.location.reload();
            }}
            className="seLang"
          >
            {themeOptions.map((theme) => (
              <option key={theme} value={theme}>
                {theme}
              </option>
            ))}
          </select>
        </label>

        <button className="btn copyBtn" onClick={copyRoomId}>
          Copy ROOM ID
        </button>
        <button className="btn leaveBtn" onClick={leaveRoom}>
          Leave
        </button>
      </div>

      <div className="editorContainer">
        <div className="editorToolbar">
          <button
            className="runButton"
            onClick={handleRunCode}
            disabled={isExecuting}
            title="Run Code (Ctrl+Enter)"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            {isExecuting ? "Running..." : "Run"}
          </button>
          <div className="toolbarSpacer"></div>
          <div className="toolbarInfo">
            <span className="languageBadge">
              {languageOptions.find((opt) => opt.value === lang)?.label || lang}
            </span>
          </div>
        </div>

        <div className="editorWrap">
          <Editor
            socket={socket}
            socketRef={socketRef}
            roomId={roomId}
            onCodeChange={handleCodeChange}
          />
        </div>

        <div
          className={`terminalContainer ${
            isTerminalCollapsed ? "collapsed" : ""
          }`}
        >
          <div className="terminalHeader" onClick={toggleTerminal}>
            <span className="terminalTitle">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                style={{ marginRight: "8px" }}
              >
                <polyline points="4 7 4 4 20 4 20 7"></polyline>
                <line x1="9" y1="20" x2="15" y2="20"></line>
                <line x1="12" y1="4" x2="12" y2="20"></line>
              </svg>
              Terminal
            </span>
            <div
              className="terminalHeaderActions"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className="clearTerminalBtn"
                onClick={clearTerminal}
                title="Clear Terminal"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
              <button
                className="toggleTerminalBtn"
                onClick={toggleTerminal}
                title={
                  isTerminalCollapsed ? "Expand Terminal" : "Collapse Terminal"
                }
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className={isTerminalCollapsed ? "rotated" : ""}
                >
                  <polyline points="18 15 12 9 6 15"></polyline>
                </svg>
              </button>
            </div>
          </div>
          {!isTerminalCollapsed && (
            <div className="terminalContent">
              <pre className="terminalOutput">
                {terminalOutput || "Output will appear here..."}
              </pre>
            </div>
          )}
          {/* <div className="terminalInputSection">
            <label className="stdinLabel">Standard Input (optional):</label>
            <textarea
              className="stdinInput"
              value={stdin}
              onChange={(e) => setStdin(e.target.value)}
              placeholder="Enter input for your program..."
              rows="2"
            />
          </div> */}
        </div>
      </div>
    </div>
  );
};

export default EditorPage;
