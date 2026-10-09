import React from 'react';
import {Text,View} from 'react-native';
export default function PersonaCapture(_props:{request:(path:string,options?:RequestInit)=>Promise<any>;token:string;category:string;documentType:string;onResult:(result:any)=>void}) {
  return <View><Text>افتح رابط طلب UTN في المتصفح لتجربة Persona. Open your UTN invitation in a browser to use Persona.</Text></View>;
}

