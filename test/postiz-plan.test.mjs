import test from "node:test";
import assert from "node:assert/strict";
import {prepareSingleImagePost,assertLiveDispatchAllowed} from "../src/postiz-plan.js";
const job={image_id:"batch20261112-0",object_key:"review/pending/batch20261112/0.jpg",review_status:"approved",status:"held",publish_at:"2026-11-14T12:30:00Z"};
const media={id:"receipt123",path:"https://insta.titanrigs.com/photo123.jpg"};
test("approved item prepares one single-image scheduled post, never carousel",()=>{
 const result=prepareSingleImagePost(job,media,"cmwakcjhq0001r46r8j756ym8");
 assert.equal(result.type,"schedule");
 assert.equal(result.date,job.publish_at);
 assert.equal(result.posts.post.length,1);
 assert.equal(result.posts.post[0].value.contentItem[0].image.imageItem.length,1);
 assert.equal(result.posts.post[0].value.contentItem[0].image.imageItem[0].path,media.path);
});
test("rejected, unapproved, or already dispatched records are refused",()=>{
 for(const patch of [{review_status:"rejected"},{status:"scheduled"},{object_key:"other/0.jpg"}]){
  assert.throws(()=>prepareSingleImagePost({...job,...patch},media,"cmwakcjhq0001r46r8j756ym8"));
 }
});
test("private or invalid media URLs are refused",()=>{
 for(const path of ["https://insta.titanrigs.com/review/pending/batch/0.jpg","http://insta.titanrigs.com/photo123.jpg","https://evil.example/image.jpg"]){
  assert.throws(()=>prepareSingleImagePost(job,{...media,path},"cmwakcjhq0001r46r8j756ym8"));
 }
});
test("publishing remains hard disabled",()=>assert.throws(assertLiveDispatchAllowed,/Publishing is paused/));
