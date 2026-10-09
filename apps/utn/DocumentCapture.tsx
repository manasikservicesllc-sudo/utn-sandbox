import React, { useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';

export type EvidenceImage = { name: string; mimeType: string; base64: string };
export type Evidence = { front: EvidenceImage | null; back: EvidenceImage | null; format: 'card' | 'page'; reviewed: boolean };
export default function DocumentCapture({ type, value, onChange }: { type: string; value: Evidence; onChange: (value: Evidence) => void }) {
  const [side, setSide] = useState<'front' | 'back'>('front');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const card = value.format === 'card';
  const complete = !!value.front && (!card || !!value.back);
  async function accept(file: { uri: string; name: string; mimeType?: string; size?: number }, target: 'front' | 'back') {
    if (file.size && file.size > 5 * 1024 * 1024) throw new Error('الصورة أكبر من 5 MB · Image exceeds 5 MB');
    let base64: string;
    if (Platform.OS === 'web') {
      const blob = await (await fetch(file.uri)).blob();
      if (blob.size > 5 * 1024 * 1024) throw new Error('الصورة أكبر من 5 MB · Image exceeds 5 MB');
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(blob.type)) throw new Error('اختر JPG أو PNG أو WebP · Unsupported image format');
      base64 = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = () => reject(new Error('تعذرت قراءة الصورة · Could not read image')); reader.readAsDataURL(blob); });
      file.mimeType = blob.type;
    } else base64 = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64 });
    onChange({ ...value, [target]: { name: file.name, mimeType: file.mimeType || 'image/jpeg', base64 }, reviewed: false });
  }
  async function pick(camera = false) {
    setError('');
    if (camera && Platform.OS === 'web') {
      const input = window.document.createElement('input');
      input.type = 'file'; input.accept = 'image/jpeg,image/png,image/webp'; input.setAttribute('capture', 'environment');
      input.onchange = async () => {
        const file = input.files?.[0]; if (!file) return;
        const uri = URL.createObjectURL(file); setBusy(true);
        try { await accept({ uri, name: file.name, mimeType: file.type, size: file.size }, side); }
        catch (e) { setError((e as Error).message); }
        finally { URL.revokeObjectURL(uri); setBusy(false); }
      };
      input.click(); return;
    }
    setBusy(true);
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: ['image/jpeg', 'image/png', 'image/webp'], multiple: false, copyToCacheDirectory: true });
      if (!picked.canceled) await accept(picked.assets[0], side);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  const image = value[side];
  return <View style={s.shell}>
    <Text style={s.heading}>جهّز وثيقتك · Prepare your document</Text>
    {type === 'residence_permit' && <View style={s.row}>{(['card', 'page'] as const).map(format => <Pressable key={format} accessibilityRole="radio" accessibilityState={{checked:value.format === format}} onPress={() => { setSide('front'); onChange({front:null,back:null,format,reviewed:false}); }} style={[s.tab, value.format === format && s.active]}><Text>{format === 'card' ? 'بطاقة · Card' : 'وثيقة إلكترونية / ورقية · Page'}</Text></Pressable>)}</View>}
    <View style={s.row}>{(card ? ['front', 'back'] as const : ['front'] as const).map(item => <Pressable key={item} accessibilityRole="tab" accessibilityState={{selected: side === item}} onPress={() => setSide(item)} style={[s.tab, side === item && s.active]}><Text style={s.label}>{value[item] ? '✓ ' : item === 'front' ? '1  ' : '2  '}{item === 'front' ? card ? 'الأمام · Front' : 'صفحة البيانات · Document page' : 'الخلف · Back'}</Text></Pressable>)}</View>
    <View style={s.frame}>{image ? <Image accessibilityLabel={side === 'front' ? 'Front document preview' : 'Back document preview'} source={{uri:`data:${image.mimeType};base64,${image.base64}`}} resizeMode="contain" style={s.preview}/> : <><Text style={s.icon}>▣</Text><Text style={s.heading}>{side === 'back' ? 'اقلب البطاقة وصوّر الخلف' : card ? 'ضع وجه البطاقة داخل الصورة' : 'صوّر صفحة البيانات كاملة'}</Text><Text style={s.copy}>Show all four corners · أظهر الزوايا الأربع</Text></>}</View>
    <Text style={s.copy}>إضاءة واضحة، بدون انعكاس، والنص مقروء. راجع الصورة قبل المتابعة.</Text>
    <Text style={s.copy}>Good lighting. No glare. Readable text. Review before continuing.</Text>
    <View style={s.row}>{Platform.OS === 'web' && <Pressable disabled={busy} accessibilityRole="button" onPress={() => pick(true)} style={s.button}><Text style={s.white}>{image ? 'إعادة التصوير · Retake' : 'التقط صورة · Take photo'}</Text></Pressable>}<Pressable disabled={busy} accessibilityRole="button" onPress={() => pick()} style={s.tab}><Text style={s.label}>{image ? 'استبدال الصورة · Replace' : 'رفع صورة · Upload image'}</Text></Pressable></View>
    <Text style={s.copy}>JPG / PNG / WebP · 5 MB لكل صورة / per image</Text>
    {Platform.OS === 'web' && <Text style={s.copy}>التصوير يستخدم كاميرا الجهاز إذا دعمها المتصفح؛ على الكمبيوتر يمكنك اختيار صورة. Camera availability depends on your browser.</Text>}
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    {busy && <Text style={s.copy}>جارٍ تجهيز الصورة · Preparing image…</Text>}
    {value.front && card && !value.back && <Pressable accessibilityRole="button" onPress={() => setSide('back')} style={s.button}><Text style={s.white}>التالي: خلف البطاقة · Continue to back →</Text></Pressable>}
    {complete && <View style={s.review}><Text style={s.heading}>راجع قبل الإرسال · Review before sending</Text><View style={s.row}>{(card ? ['front','back'] as const : ['front'] as const).map(item => <Pressable key={item} accessibilityRole="button" accessibilityLabel={`Review ${item} image`} onPress={() => setSide(item)} style={s.thumb}><Image source={{uri:`data:${value[item]!.mimeType};base64,${value[item]!.base64}`}} style={{height:80,width:'100%'}} resizeMode="contain"/><Text style={s.copy}>{item === 'front' ? 'الأمام / الصفحة · Front / page' : 'الخلف · Back'}</Text></Pressable>)}</View><Pressable accessibilityRole="checkbox" accessibilityState={{checked:value.reviewed}} onPress={() => onChange({...value,reviewed:!value.reviewed})} style={s.tab}><Text style={s.label}>{value.reviewed ? '☑' : '☐'} الصور واضحة وكاملة وتخص صاحب الطلب{ '\n' }Images are complete, readable and belong to the applicant</Text></Pressable></View>}
    <Text style={s.copy}>بعد الإرسال: قراءة البيانات ومقارنتها · Next: extract and compare fields. لا يشمل هذا الفحص مطابقة الوجه أو الحيوية أو اعتماد الجهة المصدرة.</Text>
  </View>;
}
const s = StyleSheet.create({shell:{marginVertical:20,gap:14},heading:{fontSize:19,fontWeight:'600',color:'#173d34',textAlign:'center'},row:{flexDirection:'row',flexWrap:'wrap',gap:10},tab:{padding:14,borderRadius:12,borderWidth:1,borderColor:'#cddbd3',flexGrow:1,flexShrink:1,minHeight:48,justifyContent:'center'},active:{backgroundColor:'#e2eee7',borderColor:'#1c6252'},label:{fontSize:16,color:'#173d34',textAlign:'center'},frame:{aspectRatio:1.58,borderRadius:18,borderWidth:2,borderStyle:'dashed',borderColor:'#7fa99b',backgroundColor:'#f1f6f2',justifyContent:'center',alignItems:'center',padding:14,gap:10,overflow:'hidden'},preview:{width:'100%',height:'100%'},icon:{fontSize:42,color:'#1c6252'},copy:{fontSize:14,lineHeight:22,color:'#62746c',textAlign:'center'},button:{backgroundColor:'#1c6252',padding:16,borderRadius:12,flexGrow:1,flexShrink:1,minHeight:48,justifyContent:'center'},white:{fontSize:16,fontWeight:'600',color:'white',textAlign:'center'},error:{color:'#a14739',fontSize:16},review:{backgroundColor:'#f6f5ef',padding:16,borderRadius:16,gap:12},thumb:{flexGrow:1,flexBasis:120}});
