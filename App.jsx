import React, { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  LayoutDashboard, Package, ClipboardList, CalendarClock, Plus, Search,
  Trash2, Download, X, Barcode, Save, AlertTriangle
} from "lucide-react";

const CATEGORIES = [
  "Perda de produtos", "Troca de produtos", "Conferência de produtos",
  "Produtos vencidos", "Produtos próximos do vencimento", "Produtos recebidos",
  "Controle de lotes", "Inventário", "Devoluções", "Produtos danificados",
  "Divergência de estoque", "Relatório personalizado"
];

const blankProduct = {
  barcode: "", name: "", lot: "", manufactureDate: "",
  expiryDate: "", quantity: "1"
};

const readStore = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};

export default function App() {
  const [products, setProducts] = useState(() => readStore("registers-products", []));
  const [reports, setReports] = useState(() => readStore("registers-reports", []));
  const [page, setPage] = useState("dashboard");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [reportTitle, setReportTitle] = useState("");
  const [rows, setRows] = useState([]);
  const [draft, setDraft] = useState(blankProduct);
  const [observations, setObservations] = useState("");
  const [marketName, setMarketName] = useState(
    () => localStorage.getItem("registers-market") || "Meu mercado"
  );
  const [scannerOpen, setScannerOpen] = useState(false);
  const [notice, setNotice] = useState("");

  const videoRef = useRef(null);
  const scannerRef = useRef(null);

  useEffect(() => {
    localStorage.setItem("registers-products", JSON.stringify(products));
  }, [products]);

  useEffect(() => {
    localStorage.setItem("registers-reports", JSON.stringify(reports));
  }, [reports]);

  useEffect(() => {
    localStorage.setItem("registers-market", marketName);
  }, [marketName]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const daysUntil = (date) => {
    if (!date) return null;
    const d = new Date(date + "T00:00:00");
    return Math.ceil((d - today) / 86400000);
  };

  const expired = products.filter(
    p => daysUntil(p.expiryDate) !== null && daysUntil(p.expiryDate) < 0
  );

  const nearExpiry = products.filter(p => {
    const n = daysUntil(p.expiryDate);
    return n !== null && n >= 0 && n <= 30;
  });

  const filteredProducts = products.filter(p =>
    `${p.name} ${p.barcode} ${p.lot}`.toLowerCase().includes(search.toLowerCase())
  );

  const filteredReports = reports.filter(r =>
    `${r.title} ${r.category}`.toLowerCase().includes(search.toLowerCase())
  );

  function startReport() {
    setRows([]);
    setDraft(blankProduct);
    setObservations("");
    setReportTitle(category);
    setPage("new-report");
  }

  function updateDraft(key, value) {
    setDraft(old => ({ ...old, [key]: value }));

    if (key === "barcode") {
      const found = products.find(p => p.barcode === value.trim());

      if (found) {
        setDraft(old => ({ ...old, ...found, barcode: value }));
      }
    }
  }

  function addRow() {
    if (!draft.name.trim()) {
      setNotice("Informe o nome do produto.");
      return;
    }

    const newProduct = {
      ...draft,
      id: crypto.randomUUID(),
      quantity: Number(draft.quantity) || 1
    };

    setRows(old => [...old, newProduct]);

    if (
      draft.barcode &&
      !products.some(p => p.barcode === draft.barcode)
    ) {
      setProducts(old => [...old, newProduct]);
    }

    setDraft(blankProduct);
    setNotice("Produto adicionado à tabela.");
  }

  function saveReport() {
    if (!rows.length) {
      setNotice("Adicione pelo menos um produto antes de salvar.");
      return;
    }

    const report = {
      id: crypto.randomUUID(),
      title: reportTitle.trim() || category,
      category,
      observations,
      rows,
      createdAt: new Date().toISOString()
    };

    setReports(old => [report, ...old]);
    setPage("history");
    setNotice("Relatório salvo.");
  }

  function deleteReport(id) {
    if (confirm("Excluir este relatório?")) {
      setReports(old => old.filter(r => r.id !== id));
    }
  }

  function deleteProduct(id) {
    if (confirm("Excluir este produto do cadastro?")) {
      setProducts(old => old.filter(p => p.id !== id));
    }
  }

  function exportPDF(report) {
    const doc = new jsPDF({ orientation: "landscape" });

    doc.setFontSize(18);
    doc.text(marketName, 14, 16);

    doc.setFontSize(13);
    doc.text(report.title, 14, 26);

    doc.setFontSize(9);
    doc.text(`Categoria: ${report.category}`, 14, 33);
    doc.text(
      `Criado em: ${new Date(report.createdAt).toLocaleString("pt-BR")}`,
      14, 39
    );

    autoTable(doc, {
      startY: 45,
      head: [[
        "Código de barras", "Produto", "Lote",
        "Fabricação", "Validade", "Quantidade"
      ]],
      body: report.rows.map(p => [
        p.barcode || "-",
        p.name,
        p.lot || "-",
        p.manufactureDate || "-",
        p.expiryDate || "-",
        p.quantity
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [16, 35, 63] }
    });

    const y = (doc.lastAutoTable?.finalY || 50) + 10;

    if (report.observations) {
      doc.setFontSize(10);
      doc.text("Observações:", 14, y);

      doc.setFontSize(9);
      const lines = doc.splitTextToSize(report.observations, 260);
      doc.text(lines, 14, y + 6);
    }

    doc.save(`${report.title.replace(/[^a-z0-9]/gi, "_")}.pdf`);
  }

  async function openScanner() {
    setScannerOpen(true);

    try {
      const reader = new BrowserMultiFormatReader();
      scannerRef.current = reader;

      await reader.decodeFromVideoDevice(
        undefined,
        videoRef.current,
        (result) => {
          if (result) {
            updateDraft("barcode", result.getText());
            setScannerOpen(false);
            reader.reset();
          }
        }
      );
    } catch {
      setNotice(
        "Não foi possível acessar a câmera. Verifique a permissão do navegador e use o código manualmente."
      );
      setScannerOpen(false);
    }
  }

  function closeScanner() {
    scannerRef.current?.reset();
    setScannerOpen(false);
  }

  const nav = [
    ["dashboard", "Visão geral", LayoutDashboard],
    ["products", "Produtos", Package],
    ["history", "Relatórios", ClipboardList],
    ["expiry", "Validade", CalendarClock]
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">R</div>
          <div>
            <b>Registers</b>
            <small>GESTÃO DE PRODUTOS</small>
          </div>
        </div>

        <div className="nav-label">MENU PRINCIPAL</div>

        {nav.map(([id, label, Icon]) => (
          <button
            key={id}
            className={`nav-item ${page === id ? "active" : ""}`}
            onClick={() => {
              setPage(id);
              setSearch("");
            }}
          >
            <Icon size={18} />
            <span>{label}</span>
          </button>
        ))}

        <div className="sidebar-bottom">
          <span className="status-dot"></span>
          Dados salvos neste dispositivo
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <span className="eyebrow">{marketName}</span>
            <h1>
              {{
                dashboard: "Visão geral",
                products: "Cadastro de produtos",
                history: "Histórico de relatórios",
                expiry: "Controle de validade",
                "new-report": "Novo relatório"
              }[page]}
            </h1>
          </div>

          <div className="top-actions">
            <button className="button primary" onClick={startReport}>
              <Plus size={17} /> Criar nova tabela
            </button>
          </div>
        </header>

        {notice && (
          <div className="notice" onClick={() => setNotice("")}>
            {notice} <X size={14} />
          </div>
        )}

        {page === "dashboard" && (
          <section className="content">
            <div className="welcome">
              <div>
                <h2>Bem-vindo ao Registers</h2>
                <p>
                  Organize produtos, acompanhe validades e mantenha seus
                  registros em um só lugar.
                </p>
              </div>
              <button className="button light" onClick={() => setPage("products")}>
                Ver produtos <Package size={16} />
              </button>
            </div>

            <div className="stats-grid">
              <Stat label="Produtos cadastrados" value={products.length} icon={Package} />
              <Stat label="Relatórios criados" value={reports.length} icon={ClipboardList} />
              <Stat label="Produtos vencidos" value={expired.length} icon={AlertTriangle} danger />
              <Stat label="Vencem em até 30 dias" value={nearExpiry.length} icon={CalendarClock} warning />
            </div>

            <div className="panel">
              <div className="panel-heading">
                <div>
                  <h3>Acesso rápido</h3>
                  <p>Comece um novo registro ou consulte seus dados.</p>
                </div>
              </div>

              <div className="quick-grid">
                {CATEGORIES.slice(0, 6).map((c, i) => (
                  <button
                    className="quick-card"
                    key={c}
                    onClick={() => {
                      setCategory(c);
                      setRows([]);
                      setDraft(blankProduct);
                      setObservations("");
                      setReportTitle(c);
                      setPage("new-report");
                    }}
                  >
                    <span className="quick-icon">
                      {["↘", "⇄", "✓", "!", "◷", "＋"][i]}
                    </span>
                    <b>{c}</b>
                    <small>Criar registro <span>→</span></small>
                  </button>
                ))}
              </div>
            </div>

            <div className="panel">
              <div className="panel-heading">
                <div>
                  <h3>Relatórios recentes</h3>
                  <p>Seus últimos registros salvos.</p>
                </div>
                <button className="text-button" onClick={() => setPage("history")}>
                  Ver todos →
                </button>
              </div>

              {reports.length ? (
                <div className="simple-list">
                  {reports.slice(0, 5).map(r => (
                    <div className="simple-row" key={r.id}>
                      <div className="list-icon"><ClipboardList size={17} /></div>
                      <div className="grow">
                        <b>{r.title}</b>
                        <small>
                          {r.category} · {new Date(r.createdAt).toLocaleDateString("pt-BR")}
                        </small>
                      </div>
                      <span className="muted">{r.rows.length} itens</span>
                      <button className="icon-button" onClick={() => exportPDF(r)} title="Baixar PDF">
                        <Download size={17} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty text="Nenhum relatório criado ainda." />
              )}
            </div>
          </section>
        )}

        {page === "products" && (
          <section className="content">
            <div className="toolbar">
              <div className="searchbox">
                <Search size={17} />
                <input
                  placeholder="Buscar por produto, código ou lote..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <span className="muted">{filteredProducts.length} produtos</span>
            </div>

            <div className="panel table-panel">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Produto</th>
                      <th>Código de barras</th>
                      <th>Lote</th>
                      <th>Validade</th>
                      <th>Quantidade</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.map(p => (
                      <tr key={p.id}>
                        <td><b>{p.name}</b></td>
                        <td>{p.barcode || "-"}</td>
                        <td>{p.lot || "-"}</td>
                        <td>
                          {p.expiryDate
                            ? new Date(p.expiryDate + "T00:00:00").toLocaleDateString("pt-BR")
                            : "-"}
                        </td>
                        <td>{p.quantity}</td>
                        <td>
                          <button className="icon-button danger-text" onClick={() => deleteProduct(p.id)}>
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {!filteredProducts.length && (
                  <Empty text="Nenhum produto encontrado. Cadastre produtos ao criar um relatório." />
                )}
              </div>
            </div>
          </section>
        )}

        {page === "new-report" && (
          <section className="content">
            <div className="panel form-panel">
              <div className="form-grid">
                <label>
                  Tipo de registro
                  <select
                    value={category}
                    onChange={e => {
                      setCategory(e.target.value);
                      setReportTitle(e.target.value);
                    }}
                  >
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </label>

                <label>
                  Título do relatório
                  <input
                    value={reportTitle}
                    onChange={e => setReportTitle(e.target.value)}
                    placeholder="Ex.: Conferência semanal"
                  />
                </label>
              </div>

              <div className="section-heading">
                <div>
                  <h3>Adicionar produtos</h3>
                  <p>Preencha os dados e adicione cada item à tabela.</p>
                </div>
              </div>

              <div className="form-grid three">
                <label>
                  Código de barras
                  <div className="input-with-button">
                    <input
                      value={draft.barcode}
                      onChange={e => updateDraft("barcode", e.target.value)}
                      placeholder="Digite ou leia o código"
                    />
                    <button className="scan-button" onClick={openScanner} title="Ler código">
                      <Barcode size={18} />
                    </button>
                  </div>
                </label>

                <label>
                  Nome do produto
                  <input
                    value={draft.name}
                    onChange={e => updateDraft("name", e.target.value)}
                    placeholder="Nome do produto"
                  />
                </label>

                <label>
                  Lote
                  <input
                    value={draft.lot}
                    onChange={e => updateDraft("lot", e.target.value)}
                    placeholder="Número do lote"
                  />
                </label>

                <label>
                  Data de fabricação
                  <input
                    type="date"
                    value={draft.manufactureDate}
                    onChange={e => updateDraft("manufactureDate", e.target.value)}
                  />
                </label>

                <label>
                  Data de validade
                  <input
                    type="date"
                    value={draft.expiryDate}
                    onChange={e => updateDraft("expiryDate", e.target.value)}
                  />
                </label>

                <label>
                  Quantidade
                  <input
                    type="number"
                    min="0"
                    value={draft.quantity}
                    onChange={e => updateDraft("quantity", e.target.value)}
                  />
                </label>
              </div>

              <div className="form-footer">
                <span className="muted">
                  Produtos já cadastrados são reconhecidos pelo código de barras.
                </span>
                <button className="button primary" onClick={addRow}>
                  <Plus size={16} /> Adicionar produto
                </button>
              </div>

              <div className="section-heading">
                <div>
                  <h3>Produtos neste relatório</h3>
                  <p>{rows.length} itens adicionados</p>
                </div>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Produto</th>
                      <th>Código</th>
                      <th>Lote</th>
                      <th>Validade</th>
                      <th>Qtd.</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(p => (
                      <tr key={p.id}>
                        <td><b>{p.name}</b></td>
                        <td>{p.barcode || "-"}</td>
                        <td>{p.lot || "-"}</td>
                        <td>{p.expiryDate || "-"}</td>
                        <td>{p.quantity}</td>
                        <td>
                          <button
                            className="icon-button danger-text"
                            onClick={() => setRows(old => old.filter(x => x.id !== p.id))}
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {!rows.length && <Empty text="Os produtos adicionados aparecerão aqui." />}
              </div>

              <label className="observations">
                Observações gerais
                <textarea
                  rows="4"
                  value={observations}
                  onChange={e => setObservations(e.target.value)}
                  placeholder="Descreva informações importantes sobre este registro..."
                />
              </label>

              <div className="form-footer">
                <button className="button secondary" onClick={() => setPage("dashboard")}>
                  Cancelar
                </button>
                <button className="button primary" onClick={saveReport}>
                  <Save size={16} /> Salvar relatório
                </button>
              </div>
            </div>
          </section>
        )}

        {page === "history" && (
          <section className="content">
            <div className="toolbar">
              <div className="searchbox">
                <Search size={17} />
                <input
                  placeholder="Buscar relatório..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <span className="muted">{filteredReports.length} relatórios</span>
            </div>

            <div className="panel table-panel">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Relatório</th>
                      <th>Categoria</th>
                      <th>Data</th>
                      <th>Produtos</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredReports.map(r => (
                      <tr key={r.id}>
                        <td><b>{r.title}</b></td>
                        <td>{r.category}</td>
                        <td>{new Date(r.createdAt).toLocaleDateString("pt-BR")}</td>
                        <td>{r.rows.length}</td>
                        <td>
                          <div className="action-row">
                            <button className="icon-button" title="Baixar PDF" onClick={() => exportPDF(r)}>
                              <Download size={16} />
                            </button>
                            <button className="icon-button danger-text" title="Excluir" onClick={() => deleteReport(r.id)}>
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {!filteredReports.length && <Empty text="Nenhum relatório encontrado." />}
              </div>
            </div>
          </section>
        )}

        {page === "expiry" && (
          <section className="content">
            <div className="stats-grid compact">
              <Stat label="Vencidos" value={expired.length} icon={AlertTriangle} danger />
              <Stat
                label="Vencem em até 7 dias"
                value={products.filter(p => {
                  const n = daysUntil(p.expiryDate);
                  return n !== null && n >= 0 && n <= 7;
                }).length}
                icon={CalendarClock}
                warning
              />
              <Stat
                label="Vencem em até 15 dias"
                value={products.filter(p => {
                  const n = daysUntil(p.expiryDate);
                  return n !== null && n >= 0 && n <= 15;
                }).length}
                icon={CalendarClock}
              />
              <Stat
                label="Vencem em até 60 dias"
                value={products.filter(p => {
                  const n = daysUntil(p.expiryDate);
                  return n !== null && n >= 0 && n <= 60;
                }).length}
                icon={CalendarClock}
              />
            </div>

            <div className="panel">
              <div className="panel-heading">
                <div>
                  <h3>Acompanhamento de validade</h3>
                  <p>Produtos cadastrados com data de validade.</p>
                </div>
              </div>

              {products.filter(p => p.expiryDate).length ? (
                <div className="simple-list">
                  {products
                    .filter(p => p.expiryDate)
                    .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate))
                    .map(p => {
                      const n = daysUntil(p.expiryDate);

                      return (
                        <div className="simple-row" key={p.id}>
                          <div className={`expiry-icon ${n < 0 ? "red" : n <= 15 ? "yellow" : "green"}`}>
                            <CalendarClock size={17} />
                          </div>
                          <div className="grow">
                            <b>{p.name}</b>
                            <small>
                              Lote: {p.lot || "Não informado"} · Validade:{" "}
                              {new Date(p.expiryDate + "T00:00:00").toLocaleDateString("pt-BR")}
                            </small>
                          </div>
                          <span className={`pill ${n < 0 ? "red" : n <= 15 ? "yellow" : "green"}`}>
                            {n < 0
                              ? `Vencido há ${Math.abs(n)} dias`
                              : n === 0
                              ? "Vence hoje"
                              : `Em ${n} dias`}
                          </span>
                        </div>
                      );
                    })}
                </div>
              ) : (
                <Empty text="Nenhum produto com validade cadastrada." />
              )}
            </div>
          </section>
        )}

        <footer className="footer">
          Registers · Sistema de gestão de produtos
        </footer>
      </main>

      {scannerOpen && (
        <div className="modal-backdrop">
          <div className="scanner-modal">
            <div className="modal-head">
              <b>Ler código de barras</b>
              <button className="icon-button" onClick={closeScanner}>
                <X />
              </button>
            </div>

            <video ref={videoRef} className="scanner-video" />

            <p>
              Posicione o código de barras dentro da câmera. Se não funcionar,
              digite o código manualmente.
            </p>

            <button className="button secondary full" onClick={closeScanner}>
              Fechar câmera
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, icon: Icon, danger, warning }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${danger ? "red" : warning ? "yellow" : ""}`}>
        <Icon size={19} />
      </div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function Empty({ text }) {
  return (
    <div className="empty-state">
      <div className="empty-mark"><ClipboardList size={22} /></div>
      <p>{text}</p>
    </div>
  );
}
