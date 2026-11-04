using System;using System.Diagnostics;
class JobSmoke {
  static bool Exited(int pid){try{using(var p=Process.GetProcessById(pid))return p.WaitForExit(4000);}catch(ArgumentException){return true;}}
  static int Main(string[] args){OwnedJob job=null;Process launcher=null;try{
    launcher=new Process();launcher.StartInfo=new ProcessStartInfo(args[0],"\""+args[1]+"\" "+args[2]){UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true};
    launcher.Start();job=new OwnedJob(launcher);launcher.StandardInput.WriteLine("go");launcher.StandardInput.Flush();
    int child=Int32.Parse(launcher.StandardOutput.ReadLine());int parent=launcher.Id;
    if(args[2]=="orphan"&&!launcher.WaitForExit(2000))throw new Exception("Launcher did not exit");
    job.Dispose();job=null;bool parentGone=Exited(parent),childGone=Exited(child);
    Console.WriteLine("{\"mode\":\""+args[2]+"\",\"launcherExited\":"+parentGone.ToString().ToLowerInvariant()+",\"descendantExited\":"+childGone.ToString().ToLowerInvariant()+"}");
    return parentGone&&childGone?0:1;
  }finally{if(job!=null)job.Dispose();if(launcher!=null)launcher.Dispose();}}
}
