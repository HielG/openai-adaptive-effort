using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;

sealed class Model {
  public string Id, Family, Baseline;
  public List<string> Efforts = new List<string>();
  public override string ToString() { return Id; }
}
sealed class OwnedJob : IDisposable {
  [StructLayout(LayoutKind.Sequential)] struct Basic { public long ProcessTime, JobTime; public uint Flags; public UIntPtr Min, Max; public uint Active; public UIntPtr Affinity; public uint Priority, Scheduling; }
  [StructLayout(LayoutKind.Sequential)] struct IO { public ulong A,B,C,D,E,F; }
  [StructLayout(LayoutKind.Sequential)] struct Extended { public Basic Basic; public IO IO; public UIntPtr ProcessMemory, JobMemory, PeakProcess, PeakJob; }
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr attributes,string name);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job,int kind,ref Extended info,uint length);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  IntPtr handle;
  public OwnedJob(Process child) {
    handle=CreateJobObject(IntPtr.Zero,null); var info=new Extended();info.Basic.Flags=0x2000;
    if(handle==IntPtr.Zero||!SetInformationJobObject(handle,9,ref info,(uint)Marshal.SizeOf(info))||!AssignProcessToJobObject(handle,child.Handle)) { Dispose();try{child.Kill();}catch{}throw new Exception("Could not establish ownership of the runner process. No model request was sent."); }
  }
  public void Dispose(){if(handle!=IntPtr.Zero){CloseHandle(handle);handle=IntPtr.Zero;}}
}
sealed class App : Form {
  readonly JavaScriptSerializer json=new JavaScriptSerializer {MaxJsonLength=8*1024*1024};
  readonly List<Model> models=new List<Model>();
  readonly ComboBox family=new ComboBox(), model=new ComboBox(), baseline=new ComboBox(), manual=new ComboBox();
  readonly TextBox workspace=new TextBox(), prompt=new TextBox();
  readonly RichTextBox chat=new RichTextBox();
  readonly Label badge=new Label(), message=new Label(), usage=new Label();
  readonly Button send=new Button(), stop=new Button(), fresh=new Button(), refresh=new Button(), browse=new Button();
  Process bridge;OwnedJob job;StreamWriter input;int serial=0,active=0,generation=0;bool connected=false,busy=false,frozen=false,uncertain=false,closing=false,receivedText=false;
  string bridgePath, nodePath="node",codexPath="";
  static readonly Color Background=Color.FromArgb(19,23,31),Surface=Color.FromArgb(30,36,47),Ink=Color.FromArgb(235,239,245),Muted=Color.FromArgb(164,178,198),Accent=Color.FromArgb(87,211,178);
  [STAThread] static void Main() { Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);Application.Run(new App()); }
  static string Quote(string value){return "\""+value.Replace("\"","\\\"")+"\"";}
  static string Str(Dictionary<string,object> obj,string key){object v;return obj.TryGetValue(key,out v)&&v!=null?v.ToString():"";}
  public App() {
    Text="Adaptive Effort";ClientSize=new Size(940,760);MinimumSize=new Size(800,680);StartPosition=FormStartPosition.CenterScreen;
    BackColor=Background;ForeColor=Ink;Font=new Font("Segoe UI",10);AutoScaleMode=AutoScaleMode.Dpi;
    var layout=new TableLayoutPanel {Dock=DockStyle.Fill,Padding=new Padding(22),ColumnCount=1,RowCount=7};
    layout.RowStyles.Add(new RowStyle(SizeType.Absolute,48));layout.RowStyles.Add(new RowStyle(SizeType.Absolute,48));layout.RowStyles.Add(new RowStyle(SizeType.Absolute,76));layout.RowStyles.Add(new RowStyle(SizeType.Absolute,44));layout.RowStyles.Add(new RowStyle(SizeType.Percent,100));layout.RowStyles.Add(new RowStyle(SizeType.Absolute,108));layout.RowStyles.Add(new RowStyle(SizeType.Absolute,46));Controls.Add(layout);
    var title=new Label {Text="ADAPTIVE EFFORT",Font=new Font("Segoe UI",19,FontStyle.Bold),Dock=DockStyle.Left,Width=400};
    var header=new Panel {Dock=DockStyle.Fill};header.Controls.Add(title);
    var readOnly=new Label {Text="READ-ONLY  /  LOCAL RUNNER",ForeColor=Muted,Dock=DockStyle.Right,Width=260,TextAlign=ContentAlignment.MiddleRight};header.Controls.Add(readOnly);layout.Controls.Add(header);
    var location=new TableLayoutPanel {Dock=DockStyle.Fill,ColumnCount=3,RowCount=1};location.RowStyles.Add(new RowStyle(SizeType.Percent,100));location.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,92));location.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));location.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,84));
    location.Controls.Add(new Label {Name="workspaceLabel",Text="Workspace",ForeColor=Ink,Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft});Style(workspace);workspace.Dock=DockStyle.Fill;workspace.Margin=new Padding(0,8,8,0);location.Controls.Add(workspace);ButtonStyle(browse,"Browse");browse.AutoSize=false;browse.Margin=new Padding(0,4,0,6);browse.Dock=DockStyle.Fill;location.Controls.Add(browse);layout.Controls.Add(location);
    var picks=new TableLayoutPanel {Dock=DockStyle.Fill,ColumnCount=4};for(int i=0;i<4;i++)picks.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,i==1?40:20));
    AddPicker(picks,"MODEL FAMILY",family);AddPicker(picks,"EXACT MODEL",model);AddPicker(picks,"BASELINE",baseline);AddPicker(picks,"THIS TURN",manual);layout.Controls.Add(picks);
    var status=new TableLayoutPanel {Dock=DockStyle.Fill,ColumnCount=2};status.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,270));status.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));badge.Text="Loading models...";badge.Font=new Font("Segoe UI",11,FontStyle.Bold);badge.ForeColor=Accent;badge.Dock=DockStyle.Fill;badge.TextAlign=ContentAlignment.MiddleLeft;status.Controls.Add(badge);message.ForeColor=Muted;message.Dock=DockStyle.Fill;message.TextAlign=ContentAlignment.MiddleRight;message.AutoEllipsis=true;status.Controls.Add(message);layout.Controls.Add(status);
    chat.Dock=DockStyle.Fill;chat.ReadOnly=true;chat.BackColor=Surface;chat.ForeColor=Ink;chat.BorderStyle=BorderStyle.None;chat.Font=new Font("Segoe UI",11);chat.DetectUrls=false;chat.AccessibleName="Chat conversation";chat.Margin=new Padding(0,4,0,12);layout.Controls.Add(chat);
    Style(prompt);prompt.Multiline=true;prompt.Dock=DockStyle.Fill;prompt.ScrollBars=ScrollBars.Vertical;prompt.MaxLength=256*1024;prompt.AccessibleName="Message";prompt.Margin=new Padding(0,0,0,10);layout.Controls.Add(prompt);
    var footer=new FlowLayoutPanel {Dock=DockStyle.Fill,WrapContents=false};ButtonStyle(send,"Send");send.BackColor=Accent;send.ForeColor=Background;ButtonStyle(stop,"Stop");ButtonStyle(fresh,"New chat");ButtonStyle(refresh,"Refresh models");footer.Controls.AddRange(new Control[]{send,stop,fresh,refresh});usage.ForeColor=Muted;usage.AutoSize=true;usage.Margin=new Padding(12,10,0,0);footer.Controls.Add(usage);layout.Controls.Add(footer);
    family.Items.AddRange(new object[]{"Terra","Sol","Astra","Other"});family.SelectedIndex=1;
    family.SelectedIndexChanged+=delegate{FilterModels();};model.SelectedIndexChanged+=delegate{SelectModel();};baseline.SelectedIndexChanged+=delegate{UpdateControls();};
    browse.Click+=delegate{using(var dialog=new FolderBrowserDialog()){dialog.SelectedPath=Directory.Exists(workspace.Text)?workspace.Text:"";if(dialog.ShowDialog(this)==DialogResult.OK)workspace.Text=dialog.SelectedPath;}};
    workspace.TextChanged+=delegate{UpdateControls();};send.Click+=delegate{SendPrompt();};stop.Click+=delegate{Request("cancel",new Dictionary<string,object>(),false);message.Text="Stopping owned request...";};
    fresh.Click+=delegate{if(uncertain&&MessageBox.Show(this,"The prior turn is uncertain and will not be retried. Start a separate new chat?","New chat",MessageBoxButtons.OKCancel,MessageBoxIcon.Warning)!=DialogResult.OK)return;StartNewChat();};
    refresh.Click+=delegate{LoadModels();};prompt.KeyDown+=delegate(object s,KeyEventArgs e){if(e.Control&&e.KeyCode==Keys.Enter){e.SuppressKeyPress=true;SendPrompt();}};
    Shown+=delegate{StartBridge();};FormClosing+=OnClosing;UpdateControls();
  }
  void Style(TextBox box){box.BackColor=Surface;box.ForeColor=Ink;box.BorderStyle=BorderStyle.FixedSingle;}
  void ButtonStyle(Button button,string text){button.Text=text;button.Height=32;button.AutoSize=true;button.FlatStyle=FlatStyle.Flat;button.BackColor=Surface;button.ForeColor=Ink;button.FlatAppearance.BorderColor=Color.FromArgb(60,73,91);button.Padding=new Padding(8,0,8,0);button.Margin=new Padding(0,0,8,0);}
  void AddPicker(TableLayoutPanel parent,string label,ComboBox picker){var block=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=2,Margin=new Padding(0,0,10,0)};block.RowStyles.Add(new RowStyle(SizeType.Absolute,25));block.RowStyles.Add(new RowStyle(SizeType.Percent,100));block.Controls.Add(new Label{Text=label,ForeColor=Muted,Dock=DockStyle.Fill,Font=new Font("Segoe UI",8,FontStyle.Bold)});picker.Dock=DockStyle.Top;picker.DropDownStyle=ComboBoxStyle.DropDownList;picker.BackColor=Surface;picker.ForeColor=Ink;picker.AccessibleName=label;block.Controls.Add(picker);parent.Controls.Add(block);}
  void Ui(Action action){try{if(!IsDisposed&&!closing)BeginInvoke(action);}catch(InvalidOperationException){}}
  void StartBridge(){try{
    int current=++generation;
    bridgePath=Path.Combine(Application.StartupPath,"desktop","bridge.mjs");
    var settings=json.DeserializeObject(File.ReadAllText(Path.Combine(Application.StartupPath,"desktop.settings.json"))) as Dictionary<string,object>;
    nodePath=Str(settings,"node");if(String.IsNullOrWhiteSpace(workspace.Text))workspace.Text=Str(settings,"workspace");codexPath=Str(settings,"codex");
    bridge=new Process();bridge.StartInfo=new ProcessStartInfo(nodePath,Quote(bridgePath)+(codexPath==""?"":" "+Quote(codexPath))){UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true,StandardOutputEncoding=Encoding.UTF8,StandardErrorEncoding=Encoding.UTF8,WorkingDirectory=Application.StartupPath};
    bridge.OutputDataReceived+=delegate(object s,DataReceivedEventArgs e){if(e.Data!=null){string line=e.Data;Ui(delegate{if(current==generation)Receive(line);});}};
    bridge.ErrorDataReceived+=delegate(object s,DataReceivedEventArgs e){/* Raw diagnostics can contain prompts. Never display or persist them. */};
    bridge.EnableRaisingEvents=true;bridge.Exited+=delegate{Ui(delegate{if(current!=generation)return;busy=false;uncertain=true;RetireBridge();badge.Text="Runner disconnected";message.Text="Restart the runner. An interrupted turn will not be retried.";UpdateControls();});};
    bridge.Start();job=new OwnedJob(bridge);input=new StreamWriter(bridge.StandardInput.BaseStream,new UTF8Encoding(false)){AutoFlush=true,NewLine="\n"};bridge.BeginOutputReadLine();bridge.BeginErrorReadLine();connected=true;
    Append("Adaptive Effort","Choose a workspace, model and baseline, then send a message. Effort adjusts automatically. Sending uses your Codex account; this runner has read-only access. Ctrl+Enter sends.\n");LoadModels();
  }catch(Exception ex){RetireBridge();badge.Text="Could not start runner";message.Text=ex.Message;uncertain=false;UpdateControls();}}
  void RetireBridge(){connected=false;generation++;try{if(input!=null)input.Close();}catch{}finally{if(job!=null){job.Dispose();job=null;}if(bridge!=null){bridge.Dispose();bridge=null;}input=null;}}
  internal void StartNewChat(){if(!connected){frozen=false;uncertain=false;chat.Clear();usage.Text="";models.Clear();StartBridge();}else Request("new",new Dictionary<string,object>(),true);}
  void LoadModels(){badge.Text="Loading models...";Request("models",new Dictionary<string,object>(),true);}
  void Request(string method,Dictionary<string,object> values,bool tracked){try{if(!connected||bridge==null||bridge.HasExited)throw new Exception("Runner is disconnected. Use Restart runner.");int id=++serial;if(tracked){busy=true;active=id;UpdateControls();}input.WriteLine(json.Serialize(new {id=id,method=method,@params=values}));}catch(Exception ex){busy=false;uncertain=true;RetireBridge();message.Text=ex.Message;UpdateControls();}}
  void SendPrompt(){if(!send.Enabled||String.IsNullOrWhiteSpace(prompt.Text))return;var chosen=model.SelectedItem as Model;if(chosen==null||baseline.SelectedItem==null)return;var values=new Dictionary<string,object>{{"prompt",prompt.Text},{"model",chosen.Id},{"baseline",baseline.SelectedItem.ToString()},{"workspace",workspace.Text}};if(manual.SelectedIndex>0)values["manual"]=manual.SelectedItem.ToString();Append("You",prompt.Text);prompt.Clear();manual.SelectedIndex=0;receivedText=false;frozen=true;Request("send",values,true);}
  void Append(string role,string text){if(chat.TextLength>1024*1024)chat.Clear();chat.SelectionStart=chat.TextLength;chat.SelectionColor=role=="You"?Accent:Muted;chat.AppendText("\n"+role+"\n");chat.SelectionColor=Ink;chat.AppendText(text+"\n");chat.ScrollToCaret();}
  void FilterModels(){model.Items.Clear();string selected=family.SelectedItem==null?"":family.SelectedItem.ToString().ToLowerInvariant();foreach(var item in models)if(item.Family==selected)model.Items.Add(item);if(model.Items.Count>0)model.SelectedIndex=0;else{baseline.Items.Clear();manual.Items.Clear();message.Text=family.Text+" is not available in this Codex catalog.";badge.Text="Model unavailable";}UpdateControls();}
  void SelectModel(){var selected=model.SelectedItem as Model;baseline.Items.Clear();manual.Items.Clear();if(selected!=null){foreach(string effort in selected.Efforts)baseline.Items.Add(effort);manual.Items.Add("Auto");foreach(string effort in selected.Efforts)manual.Items.Add(effort);baseline.SelectedItem=selected.Baseline;if(baseline.SelectedIndex<0&&baseline.Items.Count>0)baseline.SelectedIndex=0;manual.SelectedIndex=0;badge.Text=family.Text+"  /  Ready";message.Text="Exact model: "+selected.Id;}UpdateControls();}
  void UpdateControls(){family.Enabled=!busy&&!frozen;model.Enabled=!busy&&!frozen;baseline.Enabled=!busy&&!frozen;workspace.Enabled=!busy&&!frozen;browse.Enabled=!busy&&!frozen;refresh.Enabled=connected&&!busy&&!frozen;manual.Enabled=connected&&!busy&&!uncertain;fresh.Enabled=!busy;fresh.Text=connected?"New chat":"Restart runner";stop.Enabled=connected&&busy;send.Enabled=connected&&!busy&&!uncertain&&model.SelectedItem!=null&&baseline.SelectedItem!=null&&Directory.Exists(workspace.Text);prompt.Enabled=connected&&!busy&&!uncertain;}
  void Receive(string line){try{
    if(line.Length>8*1024*1024)throw new Exception("Runner response exceeds UI limit");
    var value=json.DeserializeObject(line) as Dictionary<string,object>;if(value==null)return;int id=Convert.ToInt32(value["id"]);if(id!=active&&id!=0)return;string type=Str(value,"type");
    if(type=="status"){badge.Text=family.Text+"  /  "+Str(value,"effort").ToUpperInvariant()+"  /  "+Str(value,"status");message.Text=Str(value,"kind");return;}
    if(type=="text"){if(!receivedText){Append("Assistant","");receivedText=true;}chat.SelectionStart=chat.TextLength;chat.SelectionColor=Ink;chat.AppendText(Str(value,"text"));chat.ScrollToCaret();return;}
    if(type=="error"){busy=false;uncertain=value.ContainsKey("uncertain")&&Convert.ToBoolean(value["uncertain"]);message.Text=Str(value,"message");badge.Text=uncertain?"Uncertain - inspect session":"Request stopped";Append("Notice",message.Text+(uncertain?"\nSession: "+Str(value,"stateFile"):""));RetireBridge();UpdateControls();return;}
    if(type!="result")return;busy=false;
    if(value.ContainsKey("models")){models.Clear();foreach(object item in (object[])value["models"]){var m=item as Dictionary<string,object>;var entry=new Model{Id=Str(m,"model"),Family=Str(m,"family"),Baseline=Str(m,"baseline")};foreach(object effort in (object[])m["supported"])entry.Efforts.Add(effort.ToString());models.Add(entry);}FilterModels();}
    else if(value.ContainsKey("newChat")){frozen=false;uncertain=false;chat.Clear();usage.Text="";badge.Text="New chat ready";SelectModel();}
    else if(value.ContainsKey("outcome")){uncertain=Str(value,"outcome")!="completed";message.Text=uncertain?Str(value,"message"):"Ready for your next message";if(uncertain){Append("Notice",message.Text+"\nSession: "+Str(value,"stateFile"));RetireBridge();}var counts=value["usage"] as Dictionary<string,object>;usage.Text=counts==null?"Usage unavailable":"Turn: "+Str(counts,"input_tokens")+" in / "+Str(counts,"output_tokens")+" out";}
    UpdateControls();if(!uncertain)prompt.Focus();
  }catch(Exception){busy=false;uncertain=true;RetireBridge();badge.Text="Protocol error";message.Text="Restart the runner; no request will be automatically retried.";UpdateControls();}}
  void OnClosing(object sender,FormClosingEventArgs e){if(closing)return;if(busy&&MessageBox.Show(this,"Stop the active request and close? The interrupted chat will require inspection and will not be retried.","Close Adaptive Effort",MessageBoxButtons.OKCancel,MessageBoxIcon.Warning)!=DialogResult.OK){e.Cancel=true;return;}closing=true;try{if(bridge!=null&&!bridge.HasExited){if(input!=null)input.Close();bridge.WaitForExit(3500);}}catch{}finally{if(job!=null)job.Dispose();if(bridge!=null)bridge.Dispose();}}
}
