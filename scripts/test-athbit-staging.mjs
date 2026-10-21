// Sends only synthetic data through the deployed OTA; never prints booking access tokens.
const origin='https://ota.utn-staging.com';
const withMobile=process.argv.includes('--with-mobile');
const reference=process.argv.find(a=>a.startsWith('--reference='))?.slice('--reference='.length) || (withMobile?'MANASIK-ATHBIT-MOBILE-20261019-01':'MANASIK-ATHBIT-TEST-20261019-01');
const payload={serviceId:'utn',visaRequest:{groupInfo:{otaRequestId:reference},package:{arrivalRoute:{transportation:{tripDate:'2026-11-20'}}},mutamers:[{otaMutamerId:5001,firstNameEn:'DEMO',familyNameEn:'MANASIK',nationalityId:818,currentCountryId:682,birthDate:'1990-05-12',gender:1,passportNumber:'DEMO1234',passportExpiryDate:'2030-01-31',emailAddress:'pilgrim@example.com'}]}};
// Fictional NANP number, not a customer's phone. Athbit test mode suppresses invitations.
if(withMobile) payload.visaRequest.mutamers[0].mobileNumber='12025550101';
const response=await fetch(origin+'/api/bookings',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':reference},body:JSON.stringify(payload)});
const booking=await response.json();
if(!response.ok){console.log(JSON.stringify({reference,mobileNumber:payload.visaRequest.mutamers[0].mobileNumber,httpStatus:response.status,error:booking.error}));process.exitCode=1;}
else {
 console.log(JSON.stringify({httpStatus:response.status,reference,bookingId:booking.id,athbitRequestId:booking.utnRequestId,provider:booking.provider,status:booking.status,invitations:booking.invitations.map(i=>({id:i.id,otaMutamerId:i.otaMutamerId,status:i.status})),notifications:booking.notifications?.map(n=>({mode:n.mode,status:n.status})),idempotentReplay:booking.idempotentReplay||false}));
 const check=await fetch(origin+'/api/bookings/'+encodeURIComponent(booking.id),{headers:{Authorization:'Bearer '+booking.accessToken}});
 const persisted=await check.json();
 console.log(JSON.stringify({persistedHttpStatus:check.status,persistedRequestId:persisted.utnRequestId,workflowEvents:persisted.invitations?.map(i=>i.action?.eventType||null)}));
}
