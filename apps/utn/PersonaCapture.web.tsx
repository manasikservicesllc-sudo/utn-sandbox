import React, {useEffect,useRef,useState} from 'react';
import {Platform,Pressable,Text,View} from 'react-native';
import Persona, {Client} from 'persona';

export default function PersonaCapture({request,token,category,documentType,onResult}:{request:(path:string,options?:RequestInit)=>Promise<any>;token:string;category:string;documentType:string;onResult:(result:any)=>void}) {
  const client=useRef<Client|null>(null), alive=useRef(true), timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const [consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('');
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;client.current?.destroy();if(timer.current)clearTimeout(timer.current);};},[]);
  const path=`/api/invitations/${encodeURIComponent(token)}`;
  async function refresh(attempt=0) {
    setBusy(true);setError('');
    try {
      const result=await request(path+'/persona-result',{method:'POST',body:'{}'});
      if(!alive.current)return;
      if(result.status!=='pending') {setBusy(false);onResult(result);return;}
      setNotice('بانتظار قرار Persona · Awaiting Persona decision');
      if(attempt<15) timer.current=setTimeout(()=>void refresh(attempt+1),4000);
      else {setBusy(false);setNotice('لا تزال النتيجة قيد المعالجة أو المراجعة. حدّث النتيجة لاحقًا · Still processing or awaiting review. Refresh later.');}
    } catch(e) {if(alive.current){setError((e as Error).message);setBusy(false);}}
  }
  async function start() {
    if(Platform.OS!=='web'){setError('افتح رابط طلبك في المتصفح لتجربة Persona · Open your invitation in a browser.');return;}
    setBusy(true);setError('');setNotice('جارٍ تجهيز جلسة التصوير · Preparing capture…');
    try {

      const session=await request(path+'/persona-session',{method:'POST',body:JSON.stringify({consent,category,documentType})});
      if(!alive.current)return;
      client.current?.destroy();
      client.current=new Persona.Client({inquiryId:session.inquiryId,sessionToken:session.sessionToken,
        onReady:()=>{if(alive.current){client.current?.open();setBusy(false);setNotice('');}},
        onComplete:()=>{client.current?.destroy();client.current=null;if(alive.current)void refresh();},
        onCancel:()=>{if(alive.current){setBusy(false);setNotice('يمكنك استئناف التصوير · You can resume your session.');}},
        onError:()=>{if(alive.current){setBusy(false);setError('تعذر فتح Persona. حاول مجددًا أو تحقق من سماح القالب لنطاق UTN · Could not open Persona. Retry or check allowed domains.');}}
      });
    }catch(e){if(alive.current){setBusy(false);setError((e as Error).message);}}
  }
  const button={backgroundColor:'#1c6252',padding:18,borderRadius:12,marginTop:14} as const;
  return <View style={{gap:16,paddingVertical:16}}>
    <Text style={{fontSize:26,color:'#173d34',fontWeight:'600'}}>تحقق عبر Persona</Text>
    <Text style={{fontSize:18,lineHeight:28}}>Document + selfie · تصوير المستند والسيلفي</Text>
    <Text style={{fontSize:16,lineHeight:26}}>ستفتح واجهة Persona الأصلية وتوجّهك أثناء التصوير حسب إعدادات القالب. ثم نعيد نتيجة الطلب إلى OTA.</Text>
    <View style={{padding:16,backgroundColor:'#fff4cf',borderRadius:12}}><Text style={{fontSize:16,lineHeight:24}}>Sandbox · تجربة بنتائج محاكاة، وليست إثباتًا حقيقيًا لأصالة المستند أو الحيوية.</Text></View>
    <Pressable accessibilityRole="checkbox" accessibilityState={{checked:consent}} onPress={()=>setConsent(!consent)} style={{padding:12}}><Text style={{fontSize:16,lineHeight:26}}>{consent?'☑':'☐'} أوافق على مشاركة المستند والسيلفي مع Persona وإعادة النتيجة لشريك السفر. I consent to Persona processing my capture and sharing the result with my travel partner.</Text></Pressable>
    <Pressable accessibilityRole="button" disabled={!consent||busy} onPress={start} style={[button,{opacity:(!consent||busy) ? .5 : 1}]}><Text style={{color:'white',fontSize:18,textAlign:'center'}}>{busy?'جارٍ التجهيز · Please wait…':'ابدأ / استأنف التصوير · Open Persona'}</Text></Pressable>
    <Pressable accessibilityRole="button" disabled={busy} onPress={()=>void refresh()} style={{padding:14}}><Text style={{fontSize:16,textAlign:'center'}}>تحديث النتيجة · Refresh result</Text></Pressable>
    {!!notice&&<Text accessibilityLiveRegion="polite" style={{fontSize:16,lineHeight:24}}>{notice}</Text>}
    {!!error&&<Text accessibilityRole="alert" style={{fontSize:16,color:'#a14739'}}>{error}</Text>}
  </View>;
}

