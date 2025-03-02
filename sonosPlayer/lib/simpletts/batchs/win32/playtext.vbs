SapiFileType=18

text = Null

needRate = False
rate = 0

needVoice = False
pVoice = Null

needFile = false
pFile = Null

For Each arg in WScript.Arguments

    If "-r" = arg Then
        needRate = True
    ElseIf needRate Then
        rate=CInt(arg)
        needRate = False
    ElseIf needVoice Then
        pVoice=arg
        needVoice = False
    ElseIf "-voice" = arg Then
        needVoice = True
    ElseIf needFile Then
        pFile=arg
        needFile = False
    ElseIf "-file" = arg Then
        needFile = True
    Else
        text = Trim(arg)
    End If

Next

' run

If "" = text Then
    WScript.StdErr.WriteLine("Missing text")
    WScript.Quit (1)
Else
    ' create file
    Set ss = CreateObject("SAPI.SpFileStream")

    ' create speaker
    hSpeaker = Null
    Set hSpeaker = CreateObject("SAPI.SpVoice")

    ' set params

    If -10 > rate Or 10 < rate Then
        WScript.StdErr.WriteLine("Set rate " & rate & " failed. Must be between -10 and 10.")
        WScript.Quit (1)
    Else
        hSpeaker.Rate = rate
    End If

    If Not IsNull(pVoice) Then

        Set list = hSpeaker.GetVoices("Name=" & pVoice)

        If list.Count <> 1 Then
            WScript.StdErr.WriteLine("Set voice " & pVoice & " failed. Unknown voice.")
            WScript.Quit (1)
        Else
            Set hSpeaker.Voice = list.Item(0)
        End If

    End If

    ' writing tts
    ' delete if exists
    With CreateObject("Scripting.FileSystemObject")
     If .FileExists(pFile) Then .DeleteFile pFile
    End With

    'On Error Resume Next
    ss.Format.Type = SapiFileType
    ss.Open pFile,3,False

    Set hSpeaker.AudioOutputStream=ss
    hSpeaker.Speak text, 8
    hSpeaker.WaitUntilDone(-1)
    ' close wav
    ss.Close
    Set ss = Nothing
    ss = Null

    ' close speaker
    Set hSpeaker = Nothing
    hSpeaker = Null

    WScript.Quit (0)

End If
