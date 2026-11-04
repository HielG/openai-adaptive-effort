using System;using System.Diagnostics;using System.IO;using System.Reflection;using System.Threading;using System.Windows.Forms;
class UiSmoke {
  static T Field<T>(App app,string name){return (T)typeof(App).GetField(name,BindingFlags.NonPublic|BindingFlags.Instance).GetValue(app);}
  static void Check(bool condition,string message){if(!condition)throw new Exception(message);}
  static void Wait(Func<bool> ready,string message){var watch=Stopwatch.StartNew();while(watch.ElapsedMilliseconds<10000){Application.DoEvents();if(ready())return;Thread.Sleep(20);}throw new Exception(message);}
  static bool Gone(int pid){try{using(var p=Process.GetProcessById(pid))return p.WaitForExit(4000);}catch(ArgumentException){return true;}}
  [STAThread] static int Main(string[] args){Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);using(var app=new App()){try{
    string mode=args[0];app.Show();
    var workspaceLabel=app.Controls.Find("workspaceLabel",true)[0];var browse=Field<Button>(app,"browse");Check(workspaceLabel.Bounds.Bottom<=workspaceLabel.Parent.ClientSize.Height&&browse.Bounds.Bottom<=browse.Parent.ClientSize.Height,"workspace controls are clipped");
    if(mode=="missing-node"){
      Wait(()=>Field<Label>(app,"badge").Text=="Could not start runner","missing node error not shown");
      Check(!Field<Button>(app,"send").Enabled&&!Field<Button>(app,"refresh").Enabled,"disconnected actions enabled");
      Field<Button>(app,"fresh").PerformClick();Application.DoEvents();Check(!Field<Button>(app,"send").Enabled,"missing node retry enabled send");
    }else{
      Wait(()=>Field<Button>(app,"send").Enabled,"catalog did not load");
      var family=Field<ComboBox>(app,"family");var model=Field<ComboBox>(app,"model");var prompt=Field<TextBox>(app,"prompt");
      if(mode=="chat"){
        family.SelectedItem="Astra";Check(model.Text=="gpt-6-astra","Astra exact ID missing");Field<ComboBox>(app,"manual").SelectedItem="high";prompt.Text="Hello 世界";Field<Button>(app,"send").PerformClick();
        Wait(()=>!Field<bool>(app,"busy"),"first turn did not finish");Check(Field<Label>(app,"badge").Text.Contains("HIGH")&&Field<Label>(app,"badge").Text.Contains("completed"),"manual effort badge incorrect");
        Check(Field<ComboBox>(app,"manual").Text=="Auto"&&!family.Enabled,"manual reset or model freeze failed");Check(Field<RichTextBox>(app,"chat").Text.Contains("世界 <script>literal</script>"),"Unicode/literal output not displayed");
        Check(File.ReadAllText(Environment.GetEnvironmentVariable("CAPTURE_FILE")).Contains("世界"),"Unicode prompt did not reach subprocess unchanged");
        prompt.Text="fix the typo";Field<Button>(app,"send").PerformClick();Wait(()=>!Field<bool>(app,"busy"),"resume did not finish");Check(Field<Label>(app,"badge").Text.Contains("MEDIUM"),"baseline did not restore");
        Field<Button>(app,"fresh").PerformClick();Wait(()=>family.Enabled,"New chat failed");family.SelectedItem="Other";Check(!Field<Button>(app,"send").Enabled&&Field<Label>(app,"badge").Text.Contains("unavailable"),"unavailable family not blocked");family.SelectedItem="Terra";Check(model.Text=="gpt-6.1-terra","Terra not selected");
      }else{
        prompt.Text="synthetic cancellation";Field<Button>(app,"send").PerformClick();Wait(()=>Field<Label>(app,"badge").Text.Contains("running"),"turn never started");Field<Button>(app,"stop").PerformClick();Wait(()=>!Field<bool>(app,"busy")&&!Field<bool>(app,"connected"),"Stop did not retire owned job");
        Check(Field<bool>(app,"uncertain")&&!Field<Button>(app,"send").Enabled,"uncertain chat did not block send");
        foreach(string line in File.ReadAllLines(Environment.GetEnvironmentVariable("CAPTURE_PID")))if(line.Trim()!="")Check(Gone(Int32.Parse(line)),"Stop left a descendant alive while UI stayed open");
        Environment.SetEnvironmentVariable("FAKE_MODE","desktop");app.StartNewChat();Wait(()=>Field<Button>(app,"send").Enabled,"restart/new chat failed");prompt.Text="hello";Field<Button>(app,"send").PerformClick();Wait(()=>!Field<bool>(app,"busy"),"new chat after Stop did not finish");Check(!Field<bool>(app,"uncertain"),"new chat remained uncertain");
      }
    }
    Console.WriteLine("{\"mode\":\""+mode+"\",\"passed\":true}");return 0;
  }catch(Exception ex){Console.Error.WriteLine(ex.ToString());return 1;}finally{typeof(App).GetField("busy",BindingFlags.NonPublic|BindingFlags.Instance).SetValue(app,false);typeof(App).GetMethod("RetireBridge",BindingFlags.NonPublic|BindingFlags.Instance).Invoke(app,null);app.Close();Application.DoEvents();}}}
}
